---
name: excel-import
description: >
  Config-driven Excel bulk import for Next.js 16 monolith. Two-phase
  (preview → confirm) Server Actions, Prisma direct, registry of per-module
  ExcelImportConfig.
  Trigger: Adding Excel import to a module, creating an ExcelImportConfig,
  implementing bulkCreate, or wiring the upload dialog.
license: Apache-2.0
metadata:
  author: pcarlos
  version: "2.0"
  scope: [shared, module]
  auto_invoke: "Adding Excel import, bulkCreate, import config, or upload dialog"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

## Architecture

```
ExcelImportDialog (moduleKey)
  → previewImportAction(moduleKey, formData)
      getConfig → parseExcelFile (xlsx) → validateRows → masterValidations → rowTransformer
      → ImportPreviewResult { validRows, errors, errorFileBase64? }
  → confirmImportAction(moduleKey, validRows)
      requireImportPermission → config.handler(rows, userId) → ImportLog.create
      → ImportConfirmResult { totalReceived, created, failed, errors }
```

**Invariants**
- One `ExcelImportConfig` per module, registered once in `registry.ts`
- Both Server Actions are synchronous (no queue, no polling). For < 5000 rows fits in HTTP timeout.
- `handler` owns Prisma logic; always returns `ImportConfirmResult`, never throws on row errors
- Strings in Spanish (project rule)
- `errors` JSON column in `ImportLog` requires cast `as unknown as Prisma.InputJsonValue`

## File layout

```
src/shared/excel-import/                    # generic infra (write once)
  types.ts | registry.ts | parser.ts | validator.ts
  master-validator.ts | error-excel-builder.ts | actions.ts
  components/ExcelImportDialog.tsx

src/app/(dashboard)/{module}/import/        # per module
  config.ts | bulk-create.ts
```

## Step 1 — `config.ts`

```typescript
import type { ExcelImportConfig } from '@/shared/excel-import/types';
import { bulkCreateXxx } from './bulk-create';

export const xxxImportConfig: ExcelImportConfig<XxxImportRow> = {
  moduleKey: 'xxx',
  displayName: 'Xxx',
  sheetName: 'Xxx',
  maxRows: 5000,
  columns: [
    { header: 'Nombre*', key: 'name', type: 'string', required: true, maxLength: 100, width: 20, example: 'Ejemplo' },
    { header: 'Estado*', key: 'status', type: 'enum', required: true, enumValues: ['ACTIVE', 'INACTIVE'], width: 15 },
    { header: 'Valor', key: 'value', type: 'number', required: false, width: 12 },
  ],
  masterValidations: [
    {
      key: 'cityName',
      lookup: async (values) => {
        const rows = await prisma.city.findMany({ where: { name: { in: values } }, select: { name: true } });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Ciudad no existe',
    },
  ],
  rowTransformer: (flat) => ({
    name: String(flat.name),
    status: String(flat.status).toUpperCase(),
    value: flat.value != null ? Number(flat.value) : null,
  }),
  handler: bulkCreateXxx,
};
```

### Column types

| type | validation |
|---|---|
| `string` | `maxLength` |
| `number` | `Number(v)` not NaN |
| `boolean` | `true/false/1/0/si/no` (case-insensitive) |
| `email` | regex |
| `enum` | must be in `enumValues` |
| `date` | `new Date(v)` valid |

## Step 2 — register

`src/shared/excel-import/registry.ts`:

```typescript
import { xxxImportConfig } from '@/app/(dashboard)/xxx/import/config';

const registry = new Map<string, ExcelImportConfig<unknown>>();
registry.set(xxxImportConfig.moduleKey, xxxImportConfig as ExcelImportConfig<unknown>);

export function getImportConfig(moduleKey: string) {
  const cfg = registry.get(moduleKey);
  if (!cfg) throw new Error(`No config for moduleKey="${moduleKey}"`);
  return cfg;
}
```

## Step 3 — `bulk-create.ts`

### Simple (single table, row-isolated errors)

```typescript
export async function bulkCreateXxx(rows: XxxImportRow[], userId: string): Promise<ImportConfirmResult> {
  const result: ImportConfirmResult = { totalReceived: rows.length, created: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    try {
      await prisma.xxx.create({ data: { ...rows[i], createdById: userId } });
      result.created++;
    } catch (e) {
      result.failed++;
      result.errors.push({
        index: i,
        data: rows[i] as unknown as Record<string, unknown>,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await writeImportLog('Xxx', result, userId);
  return result;
}
```

### Complex (related tables, atomic per batch)

```typescript
const BATCH = 100;

export async function bulkCreateXxx(rows: GroupCreateXxxRow[], userId: string): Promise<ImportConfirmResult> {
  let created = 0;
  const errors: ImportConfirmResult['errors'] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const r = await prisma.$transaction(
        batch.map((row) =>
          prisma.xxx.create({
            data: {
              ...row.xxx,
              createdBy: { connect: { id: userId } },
              ...(row.address && { addresses: { create: row.address } }),
            },
          }),
        ),
      );
      created += r.length;
    } catch (e) {
      batch.forEach((row, j) => errors.push({
        index: i + j,
        data: row as unknown as Record<string, unknown>,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  const result = { totalReceived: rows.length, created, failed: errors.length, errors };
  await writeImportLog('Xxx', result, userId);
  return result;
}
```

**Pick simple** when: single table, want row-isolated errors, < 1000 rows.
**Pick complex** when: related tables need atomic create, > 1000 rows, or heavy relations.

`writeImportLog` (in `src/shared/excel-import/log.ts`) wraps the `ImportLog.create` with the `Prisma.InputJsonValue` cast.

## Step 4 — Frontend

```tsx
<ExcelImportDialog
  open={open}
  onOpenChange={setOpen}
  moduleKey="xxx"
  title="Importar Xxx"
  onSuccess={() => router.refresh()}
/>
```

The dialog handles: template download, file upload, preview call, error file download, confirm call, final result display. Synchronous — no polling.

## Step 5 — Server Actions (generic, write once)

`src/shared/excel-import/actions.ts` exports:

```typescript
previewImportAction(moduleKey: string, formData: FormData): Promise<ActionResult<ImportPreviewResult>>
confirmImportAction(moduleKey: string, rows: Record<string, unknown>[]): Promise<ActionResult<ImportConfirmResult>>
```

Both use `requireImportPermission(moduleKey)` which calls `hasPermission(role, moduleKey, 'create')` from `@/lib/permissions` (`moduleKey` doubles as permission resource).

## Interfaces

```typescript
interface ColumnDef {
  header: string; key: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'enum' | 'date';
  required?: boolean; maxLength?: number; enumValues?: readonly string[];
  width?: number; example?: string;
}

interface MasterValidation {
  key: string;
  lookup: (values: string[]) => Promise<Set<string>>;
  errorMessage: string;
}

interface ExcelImportConfig<TRow = Record<string, unknown>> {
  moduleKey: string; displayName: string; sheetName: string;
  maxRows?: number; columns: ColumnDef[];
  masterValidations?: MasterValidation[];
  rowTransformer?: (flat: Record<string, unknown>) => TRow;
  handler: (rows: TRow[], userId: string) => Promise<ImportConfirmResult>;
}

interface RowError { row: number; field?: string; message: string }

interface ImportPreviewResult {
  totalRows: number; validCount: number; errorCount: number;
  validRows: Record<string, unknown>[]; errors: RowError[];
  errorFileBase64?: string;
}

interface ImportConfirmResult {
  totalReceived: number; created: number; failed: number;
  errors: { index: number; data: Record<string, unknown>; error: string }[];
}
```

## Checklist — new module

Per module:
- [ ] `import/config.ts` with `moduleKey`, `sheetName`, `columns`, `handler`
- [ ] `import/bulk-create.ts` returns `ImportConfirmResult`, writes `ImportLog`, never throws
- [ ] Add import line in `registry.ts`
- [ ] `<ExcelImportDialog moduleKey="..." />` in TablePage with `onSuccess`

Optional: `rowTransformer` if shape is nested, `masterValidations` for FK lookups.

## v1.0 → v2.0 notes

Dropped: NATS, BullMQ, jobId polling, ms-import-service, ExcelJS streaming, multi-tenancy. Kept: registry, two-phase flow, masterValidations, rowTransformer, ImportConfirmResult, simple/complex bulkCreate patterns. If volume grows past ~10k rows or runtime past 30s, lift `confirmImportAction` to a background queue (Inngest / Trigger.dev) but keep `previewImportAction` sync for UX.
