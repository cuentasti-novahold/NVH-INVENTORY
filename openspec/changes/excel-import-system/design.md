# Design: excel-import-system

**Project**: nvh-inventory · **Phase**: sdd-design · **Mode**: interactive (hybrid store)
**Engram**: `sdd/excel-import-system/design`
**Depends on**: `sdd/excel-import-system/proposal`
**Skill source of truth**: `skills/nextjs-16/excel-import/SKILL.md` v2.0

This document is the binding technical contract for the apply phase. Type shapes and module signatures here are the spec the implementation must conform to.

---

## 0. Deltas vs SKILL v2.0

The skill is the source of truth. After reading it in full, the design re-uses every shape unchanged with **two minor refinements** the proposal flagged:

| # | Skill says | Design says | Why |
|---|---|---|---|
| 1 | `previewImportAction(moduleKey, formData)` | `previewImportAction(moduleKey, fileBase64, fileName)` | The dialog already produces base64 from the `<input type=file>` flow today; passing base64 + name avoids a `FormData` round-trip and matches how `ImportConfirmResult.errorFileBase64` flows back. The skill's signature is illustrative — the contract that matters is "Server Action takes a file, returns `ImportPreviewResult`". |
| 2 | `confirmImportAction(moduleKey, rows: Record<string, unknown>[])` | `confirmImportAction(moduleKey, fileBase64, fileName)` | Re-parse on confirm is an explicit decision in the proposal §6/§7 (defense vs mutated client state). Sending rows from client would skip the re-validation barrier. Categories' `maxRows: 5000` keeps cost trivial. |

Everything else in §2-§4 of the skill (interfaces, registry, simple/complex bulkCreate, dialog wiring, JSON cast) is adopted **as-is**. No silent drift.

---

## 1. Type definitions (final code in `src/shared/excel-import/types.ts`)

```typescript
import type { Resource } from '@/lib/permissions';

// ─── Column descriptors ──────────────────────────────────────────────────────

export type ColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'email'
  | 'enum'
  | 'date';

export interface ColumnDef {
  /** Header text shown in the .xlsx (e.g. "Nombre*"). */
  header: string;
  /** Object-key after `sheet_to_json` and after `rowTransformer`. */
  key: string;
  type: ColumnType;
  required?: boolean;
  /** Only for `type: 'string'`. Validator returns RowError if exceeded. */
  maxLength?: number;
  /** Only for `type: 'enum'`. Case-sensitive comparison; transformer normalises. */
  enumValues?: readonly string[];
  /** Excel column width hint for the template builder (cells, not pixels). */
  width?: number;
  /** Optional example string written into row 2 of the template. */
  example?: string;
}

// ─── Master-data validations (FK lookup by name) ─────────────────────────────

export interface MasterValidation {
  /** Column key whose values are looked up (e.g. "parentName"). */
  key: string;
  /**
   * Receives ALL non-empty values for `key` across the file (deduped).
   * Returns the Set of values that EXIST in the master table.
   * Values not in the returned set produce a row error.
   */
  lookup: (values: string[]) => Promise<Set<string>>;
  /** Spanish error message attached to each missing-value RowError. */
  errorMessage: string;
}

// ─── Row error (preview phase) ───────────────────────────────────────────────

export interface RowError {
  /** 1-indexed row in the .xlsx as the user sees it (header is row 1, data starts at row 2). */
  row: number;
  /** Column key when the error is field-scoped; omit for whole-row errors. */
  field?: string;
  message: string;
}

// ─── Permission resource alias ───────────────────────────────────────────────

/** moduleKey doubles as the permission resource passed to hasPermission. */
export type ImportPermissionResource = Resource;

// ─── Per-module config ───────────────────────────────────────────────────────

export interface ExcelImportConfig<TRow = Record<string, unknown>> {
  /** Stable identifier; doubles as permission Resource (e.g. 'categories'). */
  moduleKey: ImportPermissionResource;
  /** Spanish label for UI (e.g. "Categorías"). */
  displayName: string;
  /** Worksheet name inside the .xlsx (e.g. "Categorías"). */
  sheetName: string;
  /** Hard cap; over this the action returns VALIDATION error. Default 5000. */
  maxRows?: number;
  columns: ColumnDef[];
  masterValidations?: MasterValidation[];
  /**
   * Optional flat→nested transformer. Runs AFTER column validation passes.
   * If omitted, valid rows pass through as Record<string, unknown>.
   */
  rowTransformer?: (flat: Record<string, unknown>) => TRow;
  /**
   * Per-module insert handler. Receives transformed rows, returns the result.
   * MUST call writeImportLog before returning. MUST NOT throw on row errors.
   */
  handler: (rows: TRow[], userId: string) => Promise<ImportConfirmResult>;
}

// ─── Server Action results ───────────────────────────────────────────────────

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  /** Rows that passed column + master validation, post-transformer. */
  validRows: Record<string, unknown>[];
  /** All errors, including multiple per row. */
  errors: RowError[];
  /** Base64 .xlsx with original rows + "Errores" column. Only if errorCount > 0. */
  errorFileBase64?: string;
}

export interface ImportConfirmResult {
  totalReceived: number;
  created: number;
  failed: number;
  errors: {
    /** 0-indexed offset into the rows array passed to handler. */
    index: number;
    data: Record<string, unknown>;
    error: string;
  }[];
  /** Base64 error-annotated .xlsx; only if failed > 0. */
  errorFileBase64?: string;
}
```

Confirmed alignment: `ColumnDef`, `MasterValidation`, `ExcelImportConfig`, `RowError`, `ImportPreviewResult`, `ImportConfirmResult` are **identical** in field names and semantics to the skill's "Interfaces" section. The only addition is `ImportPermissionResource` (alias of `@/lib/permissions.Resource`) for type-safe `moduleKey`, and `errorFileBase64` on `ImportConfirmResult` (the skill mentions it on `ImportPreviewResult`; we propagate it on confirm too because that is when row-isolated errors surface).

---

## 2. Module signatures (`src/shared/excel-import/`)

### `parser.ts`

```typescript
import * as XLSX from 'xlsx';

export class ExcelParseError extends Error {
  constructor(public readonly code: 'SHEET_NOT_FOUND' | 'EMPTY_SHEET' | 'BAD_FILE', message: string) {
    super(message);
  }
}

/**
 * Decodes base64 to a Buffer, opens the workbook, returns rows from `sheetName`.
 * Throws ExcelParseError('SHEET_NOT_FOUND') if the sheet does not exist.
 * Throws ExcelParseError('EMPTY_SHEET') if the sheet has zero data rows.
 * Throws ExcelParseError('BAD_FILE') on any xlsx.read failure.
 * `defval: null` so missing cells become null (not undefined).
 */
export function parseExcelFile(
  fileBase64: string,
  sheetName: string,
): Record<string, unknown>[];
```

The action wraps parser exceptions as `err('VALIDATION', '<spanish>')`.

### `validator.ts`

```typescript
import type { ColumnDef, RowError } from './types';

export interface ValidateRowsResult {
  /** Rows that passed every column rule, in original order. Same length as the input minus failures. */
  validRows: Record<string, unknown>[];
  /** All errors, possibly multiple per row (no short-circuit on first failure per row). */
  errors: RowError[];
  /** Map original-row-index (0-based) → 1-based xlsx row (for callers that need it). */
  rowNumbers: number[];
}

/**
 * Per-row, per-column validation. For each row:
 *   1. Required check  → push RowError if missing.
 *   2. Type check       → string maxLength, number isFinite, email regex, enum membership, date validity.
 *   3. Boolean coercion → 'true'|'false'|1|0|'si'|'no' (case-insensitive).
 *
 * A row with ANY error is excluded from `validRows`; ALL its errors are pushed.
 * `row` in RowError is `index + 2` (header is row 1).
 */
export function validateRows(
  rows: Record<string, unknown>[],
  columns: ColumnDef[],
): ValidateRowsResult;
```

Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (skill uses generic regex; fine for v1).

### `master-validator.ts`

```typescript
import type { MasterValidation, RowError } from './types';

/**
 * Runs each MasterValidation once with the deduped non-empty values for its key.
 *
 * Strategy:
 *   for each MV:
 *     values = unique([row[mv.key] for row in rows if non-empty string])
 *     existing = await mv.lookup(values)
 *     for each row: if row[mv.key] && !existing.has(row[mv.key])
 *       errors.push({ row: i+2, field: mv.key, message: mv.errorMessage })
 *
 * One round-trip per MV, regardless of row count.
 * Returns ONLY errors (caller merges with column errors).
 */
export async function runMasterValidations(
  rows: Record<string, unknown>[],
  validations: MasterValidation[] | undefined,
): Promise<RowError[]>;
```

### `error-excel-builder.ts`

```typescript
import type { ColumnDef, RowError } from './types';

/**
 * Builds a base64 .xlsx with:
 *   - Original column headers, in `columns` order
 *   - Plus an "Errores" column appended at the end
 *
 * For each input row, "Errores" = errors for that row joined with "; ".
 * Rows with no errors get an empty "Errores" cell.
 *
 * Internally uses `XLSX.utils.json_to_sheet` + `XLSX.write({ type: 'base64' })`.
 * Sheet name = `<sheetName> errores`.
 */
export function buildErrorExcel(
  rows: Record<string, unknown>[],
  errors: RowError[],
  columns: ColumnDef[],
  sheetName: string,
): string;
```

### `log.ts`

```typescript
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { ImportConfirmResult } from './types';

/**
 * Single helper that owns the JSON cast.
 * `entity` is the DDD aggregate (e.g. 'Category', 'Employee', 'Asset').
 * Status: 'COMPLETED' if any rows succeeded, 'FAILED' if all failed (and any received).
 */
export async function writeImportLog(
  entity: string,
  result: ImportConfirmResult,
  userId: string,
  fileName: string,
): Promise<void>;
```

Implementation skeleton:

```typescript
await prisma.importLog.create({
  data: {
    userId,
    entity,
    fileName,
    totalRows: result.totalReceived,
    successRows: result.created,
    errorRows: result.failed,
    errors: result.errors.length > 0
      ? (result.errors as unknown as Prisma.InputJsonValue)
      : undefined,
    status:
      result.totalReceived > 0 && result.created === 0
        ? 'FAILED'
        : 'COMPLETED',
  },
});
```

### `registry.ts`

```typescript
import type { ExcelImportConfig } from './types';
import { categoriesImportConfig } from '@/app/(dashboard)/settings/categories/import/config';

const registry = new Map<string, ExcelImportConfig<unknown>>();

registry.set(
  categoriesImportConfig.moduleKey,
  categoriesImportConfig as ExcelImportConfig<unknown>,
);

export function getImportConfig(moduleKey: string): ExcelImportConfig<Record<string, unknown>> {
  const cfg = registry.get(moduleKey);
  if (!cfg) {
    throw new Error(`No hay configuración de importación para "${moduleKey}"`);
  }
  return cfg as ExcelImportConfig<Record<string, unknown>>;
}
```

Adding a new module = one import + one `registry.set` line.

### `actions.ts`

```typescript
'use server';

import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { getImportConfig } from './registry';
import { parseExcelFile, ExcelParseError } from './parser';
import { validateRows } from './validator';
import { runMasterValidations } from './master-validator';
import { buildErrorExcel } from './error-excel-builder';
import type { ImportPreviewResult, ImportConfirmResult } from './types';

export async function previewImportAction(
  moduleKey: string,
  fileBase64: string,
): Promise<ActionResult<ImportPreviewResult>>;

export async function confirmImportAction(
  moduleKey: string,
  fileBase64: string,
  fileName: string,
): Promise<ActionResult<ImportConfirmResult>>;
```

Error codes returned (uses existing `ActionErrorCode`):

| Condition | Code | Message (Spanish) |
|---|---|---|
| No session | `UNAUTHORIZED` | `'No autenticado'` |
| Role lacks `<moduleKey>:create` | `FORBIDDEN` | `'Sin permiso'` |
| `getImportConfig` throws | `VALIDATION` | error message from registry |
| `parseExcelFile` throws SHEET_NOT_FOUND | `VALIDATION` | `'Hoja "<sheetName>" no encontrada'` |
| `parseExcelFile` throws EMPTY_SHEET | `VALIDATION` | `'El archivo no contiene filas'` |
| `parseExcelFile` throws BAD_FILE | `VALIDATION` | `'Archivo Excel inválido'` |
| `rows.length > maxRows` | `VALIDATION` | `'Excede el límite de N filas'` |
| Handler throws (catastrophic, NOT row error) | `UNKNOWN` | `'Error al procesar la importación'` |

Action body sketch (preview):

```
1. const guard = await requireImportPermission(moduleKey)
   → { ok:false, error } | { ok:true, userId }
2. const config = getImportConfig(moduleKey)
3. const rawRows = parseExcelFile(fileBase64, config.sheetName)
4. if (rawRows.length > (config.maxRows ?? 5000)) → err VALIDATION
5. const colResult = validateRows(rawRows, config.columns)
6. const masterErrors = await runMasterValidations(rawRows, config.masterValidations)
7. const allErrors = [...colResult.errors, ...masterErrors]
8. let validRows = colResult.validRows
   if (config.rowTransformer) validRows = validRows.map(config.rowTransformer)
   // also drop rows that failed master validation
9. const errorFileBase64 = allErrors.length > 0
     ? buildErrorExcel(rawRows, allErrors, config.columns, config.sheetName)
     : undefined
10. return ok({ totalRows, validCount, errorCount, validRows, errors, errorFileBase64 })
```

Action body sketch (confirm):

```
1-7. identical to preview (re-parse + re-validate)
8. if validRows is empty AND errors > 0 → return ok({ totalReceived, created:0, failed:N, errors, errorFileBase64 })
   (still write ImportLog inside handler? NO — call writeImportLog directly here for the all-failed case)
9. const result = await config.handler(validRows, guard.userId)
10. if (result.failed > 0) result.errorFileBase64 = buildErrorExcel(...)
11. return ok(result)
```

`requireImportPermission(moduleKey)` is the local AuthCheck pattern from existing `actions.ts` files, copy-pasted with `moduleKey as Resource` for the permission call.

---

## 3. The `handler` contract

```typescript
type Handler<TRow> = (rows: TRow[], userId: string) => Promise<ImportConfirmResult>;
```

**Rules**:

1. `TRow` is the **post-transformer** type. If the config has no `rowTransformer`, `TRow = Record<string, unknown>`.
2. `userId` comes from the Server Action guard — the handler trusts it.
3. The handler MUST call `await writeImportLog(entity, result, userId, fileName)` exactly once before returning.
   The handler does NOT receive `fileName`; the actions layer passes `fileName` separately when it ALSO calls `writeImportLog` for the all-failed-before-handler case. To avoid double-logging, the rule is:
   - If `validRows.length > 0` → handler runs and handler logs.
   - If `validRows.length === 0 && errors.length > 0` → action logs directly with `created: 0, failed: errors.length`.
4. The handler MUST NOT throw on row-level errors. Any per-row failure is captured into `result.errors` with a Spanish message.
5. The handler MAY throw on catastrophic failures (DB unreachable, etc.). The action catches and returns `err('UNKNOWN', ...)`.

**Handler does not receive `fileName`** — to keep its signature module-agnostic. The handler hard-codes its `entity` string and a default fileName like `'<module>-import.xlsx'`. The action passes the real fileName only in the all-failed-before-handler branch. This mirrors the skill's signature `handler(rows, userId)` exactly.

---

## 4. Categories implementation contract

### `CategoryImportRow` (post-transformer shape)

```typescript
// src/app/(dashboard)/settings/categories/import/config.ts

export interface CategoryImportRow {
  name: string;
  prefix: string;
  description: string | null;
  defaultUsefulLife: number | null;
  /** Resolved FROM parentName via masterValidation. null = root category. */
  parentName: string | null;
}
```

`fieldConfig` and `sequence` are **not** importable (per proposal §3, §6). `sequence: 0` is set by the handler. `fieldConfig` is edited post-import via the existing form.

### `categoriesImportConfig.columns` (5 entries)

```typescript
const columns: ColumnDef[] = [
  {
    header: 'Nombre*',
    key: 'name',
    type: 'string',
    required: true,
    maxLength: 100,
    width: 28,
    example: 'Computador Portátil',
  },
  {
    header: 'Prefijo*',
    key: 'prefix',
    type: 'string',
    required: true,
    maxLength: 10,
    width: 12,
    example: 'PC',
  },
  {
    header: 'Descripción',
    key: 'description',
    type: 'string',
    required: false,
    maxLength: 500,
    width: 40,
    example: 'Equipos portátiles para personal',
  },
  {
    header: 'Vida útil (años)',
    key: 'defaultUsefulLife',
    type: 'number',
    required: false,
    width: 16,
    example: '5',
  },
  {
    header: 'Categoría padre',
    key: 'parentName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 28,
    example: 'Hardware',
  },
];
```

### `masterValidations` — parentName lookup

```typescript
masterValidations: [
  {
    key: 'parentName',
    lookup: async (values) => {
      const rows = await prisma.category.findMany({
        where: { name: { in: values } },
        select: { name: true },
      });
      return new Set(rows.map((r) => r.name));
    },
    errorMessage: 'Categoría padre no existe',
  },
],
```

One Prisma query per import (regardless of row count). Empty/missing `parentName` is skipped by `runMasterValidations` (only non-empty strings are looked up) — root categories pass.

### `rowTransformer`

```typescript
rowTransformer: (flat): CategoryImportRow => ({
  name: String(flat.name).trim(),
  prefix: String(flat.prefix).trim().toUpperCase(),
  description: flat.description ? String(flat.description).trim() : null,
  defaultUsefulLife:
    flat.defaultUsefulLife != null && flat.defaultUsefulLife !== ''
      ? Number(flat.defaultUsefulLife)
      : null,
  parentName: flat.parentName ? String(flat.parentName).trim() : null,
}),
```

`prefix.toUpperCase()` matches existing convention (existing seed data uses uppercase prefixes — PC, DSK, MON, etc.).

### `bulkCreateCategories(rows, userId)` — simple loop pattern

Single table, row-isolated errors per skill §"Simple". Pseudocode:

```typescript
// src/app/(dashboard)/settings/categories/import/bulk-create.ts

export async function bulkCreateCategories(
  rows: CategoryImportRow[],
  userId: string,
): Promise<ImportConfirmResult> {
  // Pre-resolve parentName → parentId in ONE query (the master set is already
  // proven to exist by master-validator, so name→id lookup is safe).
  const parentNames = [
    ...new Set(rows.map((r) => r.parentName).filter((n): n is string => !!n)),
  ];
  const parents = parentNames.length
    ? await prisma.category.findMany({
        where: { name: { in: parentNames } },
        select: { id: true, name: true },
      })
    : [];
  const parentByName = new Map(parents.map((p) => [p.name, p.id]));

  const result: ImportConfirmResult = {
    totalReceived: rows.length,
    created: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    try {
      await prisma.category.create({
        data: {
          name: r.name,
          prefix: r.prefix,
          description: r.description,
          defaultUsefulLife: r.defaultUsefulLife,
          sequence: 0,
          ...(r.parentName
            ? { parent: { connect: { id: parentByName.get(r.parentName)! } } }
            : {}),
        },
      });
      result.created++;
    } catch (e) {
      result.failed++;
      result.errors.push({
        index: i,
        data: r as unknown as Record<string, unknown>,
        error: prismaErrorToSpanish(e),
      });
    }
  }

  await writeImportLog('Category', result, userId, 'categories-import.xlsx');
  return result;
}
```

`prismaErrorToSpanish` is a local helper that maps `P2002` on `name` / `prefix` to Spanish duplicate messages (mirrors existing `createCategoryAction`'s isP2002 logic).

---

## 5. Dialog state machine — `ExcelImportDialog` v2

Path: `src/shared/excel-import/components/ExcelImportDialog.tsx`. `'use client'`.

States:

```
idle → selecting → previewing → preview-result → confirming → done
                                      │                          │
                                      └────── error ─────────────┘
```

Transitions and UI per state:

| State | Trigger | UI shown | Actions available |
|---|---|---|---|
| `idle` | dialog opens | File picker (`<input type=file accept=".xlsx,.xls">`), helper text with column hints from `config.columns`, "Descargar plantilla" button (post-MVP — disabled placeholder for now per scope) | Cancel, Select file |
| `selecting` | user picks file | File name + size; spinner "Leyendo archivo…" while we base64-encode | (none — auto-advances) |
| `previewing` | base64 ready | Spinner "Validando…" while `previewImportAction` runs | Cancel |
| `preview-result` | preview returns ok | Banner with `validCount` / `errorCount` / `totalRows`; if `errorCount > 0` show first 10 errors in a table + "Descargar archivo de errores" button (decodes `errorFileBase64`) | Cancel, **Confirmar importación** (disabled if `validCount === 0`) |
| `confirming` | user clicks Confirmar | Spinner "Importando…" while `confirmImportAction` runs | (none — modal blocked) |
| `done` | confirm returns ok | Success summary: `created` / `failed`; if `failed > 0` show "Descargar archivo de errores" using `errorFileBase64` from confirm result; "Cerrar" calls `onSuccess` then `onOpenChange(false)` | Cerrar |
| `error` | any action returns `ok:false` OR base64 read fails | Error icon + `result.message`; "Volver" returns to `idle` | Volver, Cerrar |

Dialog **resets to `idle`** on every `open === true` (mirrors v1 `useEffect`).

State variables:

```typescript
type DialogState =
  | { kind: 'idle' }
  | { kind: 'selecting'; fileName: string }
  | { kind: 'previewing'; fileName: string; fileBase64: string }
  | { kind: 'preview-result'; fileName: string; fileBase64: string; preview: ImportPreviewResult }
  | { kind: 'confirming'; fileName: string; fileBase64: string }
  | { kind: 'done'; result: ImportConfirmResult }
  | { kind: 'error'; message: string };
```

Discriminated union — each state carries only the data it needs. `fileBase64` is held in client memory through preview→confirm so the user does not re-upload (~6.7MB max for a 5MB file post-base64).

Props:

```typescript
interface ExcelImportDialogV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleKey: string;
  title: string;
  description?: string;
  onSuccess?: (result: ImportConfirmResult) => void;
}
```

The dialog calls `getImportConfig(moduleKey)` only on the **server side** (via the action). Client-side it does NOT have a synchronous view of the columns. To still show column hints in `idle`, the dialog accepts `moduleKey` and an OPTIONAL `columnHints?: { header: string; required: boolean }[]` from props — the `CategoriesTablePage` builds this hint from a re-export of just headers (not the whole config, which contains server-only Prisma calls in `lookup`). Decision: use a small client-safe export `categoriesImportColumnHints` from a separate `config.client.ts` to avoid bundling Prisma. Apply phase MUST split the config into `config.ts` (server) + `config.client.ts` (header strings only).

---

## 6. Registry mechanic — explained

The Map type is `Map<string, ExcelImportConfig<unknown>>`. The cast at registration:

```typescript
registry.set(cfg.moduleKey, cfg as ExcelImportConfig<unknown>);
```

…erases the per-module `TRow` parameter so heterogeneous configs fit in one map.

The cast at retrieval:

```typescript
return cfg as ExcelImportConfig<Record<string, unknown>>;
```

…re-types `TRow` to a permissive shape **only at the action boundary**. This is safe because:

1. The action calls `config.handler(validRows, userId)` where `validRows` is already `Record<string, unknown>[]` (transformer returns whatever, but types alone do not enforce the shape — runtime validation does).
2. Inside `bulkCreateCategories`, the local TypeScript signature still narrows to `CategoryImportRow[]`. The function is referenced from `config.handler` where the original `<CategoryImportRow>` parameter is preserved at the source declaration.
3. The unsoundness is bounded: a misshaped row reaches `prisma.category.create` and fails with a runtime error captured into `result.errors`. No type-only invariant is broken silently.

This is the same trade-off the skill makes (§Step 2) — explicit, documented, contained at the registry boundary.

---

## 7. Test boundary (informational — strict TDD disabled)

Suggested layering when tests are added in a future change:

| Module | Strategy |
|---|---|
| `parser.ts` | Pure: feed base64 fixtures, assert rows. No DB. |
| `validator.ts` | Pure: feed `{ rows, columns }`, assert `errors`/`validRows`. |
| `master-validator.ts` | Mock `lookup` callbacks; assert dedup + error mapping. |
| `error-excel-builder.ts` | Build → re-parse with `XLSX.read`, assert "Errores" column populated. |
| `log.ts` | Mock `prisma.importLog.create`; assert payload shape and JSON cast. |
| `actions.ts` | Integration: mock `auth`, `prisma`, plus the registry's handler; cover all branches in §2 error-codes table. |
| `bulkCreateCategories` | Integration: real (test) DB or mocked Prisma; assert P2002 → row error. |
| Dialog | E2E (Playwright) — out of scope for this change. |

---

## 8. Open design questions

None — design is locked.

The two deltas vs the skill (§0) are intentional and documented; everything else is a verbatim adoption of the skill v2.0 contract.
