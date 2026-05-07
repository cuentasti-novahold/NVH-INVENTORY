# Tasks: excel-import-system

**Project**: nvh-inventory · **Change**: excel-import-system · **Phase**: sdd-tasks (hybrid)
**Depends on**: spec (#189) · design (#190) · proposal (#188)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~685 (660 new + 25 modified) |
| 400-line budget risk | **Medium** — each PR is individually safe |
| Chained PRs recommended | **Yes** |
| Suggested split | PR1a → PR1b → PR2 |
| Delivery strategy | `auto-chain` |

Decision needed before apply: No
Chained PRs recommended: Yes
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Est LOC | Depends |
|------|------|-----------|---------|---------|
| PR1a | Pure data layer — types, registry, log, parser, validator, master-validator, error-excel-builder | PR1a | ~295 | — |
| PR1b | Entry points — actions (Server Actions) + ExcelImportDialog component | PR1b | ~250 | PR1a |
| PR2  | Categories module wiring — config.client.ts, config.ts, bulk-create.ts, CategoriesTablePage | PR2  | ~140 | PR1b |

### Suggested PR Titles

- **PR1a**: `feat: add excel-import shared data layer (types, registry, parser, validator, master-validator, error-builder, log)`
- **PR1b**: `feat: add excel-import Server Actions and ExcelImportDialog v2 component`
- **PR2**: `feat: wire categories Excel import (config, bulk-create, CategoriesTablePage button)`

---

## Phase 1 — Foundation / Data Layer [PR1a]

All files are pure TypeScript with no UI. No Server Actions yet. Independently buildable.

- [x] T-01 — CREATE `src/shared/excel-import/types.ts` (~60 LOC)
  - Exports: `ColumnDef`, `MasterValidation`, `ExcelImportConfig<TRow>`, `RowError`, `ImportPreviewResult`, `ImportConfirmResult`, `ImportPermissionResource`
  - Design §1 pins all shapes. Spec: REQ-01 (two-phase), REQ-04 (per-row errors), REQ-07 (errorFileBase64)
  - Accept: `errorFileBase64` present on BOTH `ImportPreviewResult` and `ImportConfirmResult` (design §1 addition)
  - Dependencies: none

- [x] T-02 — CREATE `src/shared/excel-import/registry.ts` (~20 LOC)
  - `Map<string, ExcelImportConfig<unknown>>`, `registry.set(...)`, `getImportConfig(moduleKey)` throws Spanish error on miss
  - Design §2 (registry) + §6 (safety). Spec: REQ-02 (unknown moduleKey → VALIDATION error)
  - Accept: `getImportConfig("nonexistent")` throws `Error` with Spanish message; starts empty (no imports yet)
  - Dependencies: T-01

- [x] T-03 — CREATE `src/shared/excel-import/log.ts` (~20 LOC)
  - Exports: `writeImportLog(entity, result, userId, fileName): Promise<void>`
  - Owns `as unknown as Prisma.InputJsonValue` cast; status = `FAILED` only when `totalReceived > 0 && created === 0`
  - Design §2 (log.ts signature). Spec: REQ-08 (audit log, COMPLETED vs FAILED)
  - Accept: writes exactly one `ImportLog` row; status COMPLETED when any row succeeded, FAILED when all fail
  - Dependencies: T-01

- [x] T-04 — CREATE `src/shared/excel-import/parser.ts` (~40 LOC)
  - Exports: `parseExcelFile(fileBase64, sheetName, maxRows): Record<string, unknown>[]`
  - Throws `ExcelParseError` with codes: `SHEET_NOT_FOUND`, `EMPTY_SHEET`, `BAD_FILE`
  - Enforces file constraints pre-parsing (10 MB limit, correct sheet, maxRows). Uses `xlsx` (already installed).
  - Design §2 (parser signature). Spec: REQ-09 (file constraints — size, sheet name, maxRows)
  - Accept: wrong sheetName throws SHEET_NOT_FOUND; >5000 rows throws maxRows error in Spanish
  - Dependencies: T-01

- [x] T-05 — CREATE `src/shared/excel-import/validator.ts` (~80 LOC)
  - Exports: `validateRows(rows, columns): { validRows, errors: RowError[], rowNumbers }`
  - Validates: required, string/number/boolean/email/enum/date types, maxLength, enumValues
  - Accumulates ALL errors per row (no short-circuit). Excludes row from validRows on any error.
  - Design §2 (validator.ts). Spec: REQ-04 (row validation, multiple errors per row)
  - Accept: row with 2 errors returns both in errors[]; valid rows excluded from errors
  - Dependencies: T-01

- [x] T-06 — CREATE `src/shared/excel-import/master-validator.ts` (~40 LOC)
  - Exports: `runMasterValidations(rows, mvs): Promise<RowError[]>`
  - One Prisma call per MV with deduped non-empty values via `lookup(values)`; runs AFTER type validation
  - Design §2 (master-validator). Spec: REQ-05 (master data lookups, parentName not found = row error)
  - Accept: unknown parentName returns RowError with design-specified Spanish message; known parentName produces no error
  - Dependencies: T-01

- [x] T-07 — CREATE `src/shared/excel-import/error-excel-builder.ts` (~35 LOC)
  - Exports: `buildErrorExcel(rows, errors, columns, sheetName): string` (base64)
  - Appends "Errores" column to original sheet; `;`-joins multiple messages per row; empty string for clean rows
  - Design §2 (error-excel-builder). Spec: REQ-07 (error file format, zero-error = no file)
  - Accept: returns base64 string; rows without errors have empty "Errores" cell
  - Dependencies: T-01

---

## Phase 2 — Entry Points [PR1b]

Depends on Phase 1 (PR1a merged). Server Actions + Client dialog.

- [x] T-08 — CREATE `src/shared/excel-import/actions.ts` (~70 LOC)
  - Exports: `previewImportAction(moduleKey, fileBase64, fileName)` and `confirmImportAction(moduleKey, fileBase64, fileName)`
  - Both return `ActionResult<ImportPreviewResult|ImportConfirmResult>`; error codes: UNAUTHORIZED, FORBIDDEN, VALIDATION, UNKNOWN
  - `confirm` re-parses + re-validates from base64 (server-trust, never trusts client validRows)
  - All-failed-before-handler case: action calls `writeImportLog` directly; handler not invoked
  - Design §2 (actions.ts), §3 (handler contract). Spec: REQ-01, REQ-02, REQ-03, REQ-08
  - Accept: VIEWER → FORBIDDEN; unknown moduleKey → VALIDATION Spanish; confirm re-parses regardless of preview
  - Dependencies: T-01, T-02, T-03, T-04, T-05, T-06, T-07

- [x] T-09 — CREATE `src/shared/excel-import/components/ExcelImportDialog.tsx` (~180 LOC)
  - Discriminated-union state machine: `idle → selecting → previewing → preview-result → confirming → done | error`
  - Props: `{ open, onOpenChange, moduleKey, title, description?, onSuccess? }`
  - Holds `fileBase64` in client memory through preview → confirm (no re-upload)
  - Shows column hints from `config.client.ts` (client-safe import — no Prisma); resets to idle on every `open === true`
  - "Descargar archivo de errores" button on preview-result and done states; shows first 10 errors in preview-result
  - Design §5 (dialog state machine). Spec: REQ-01 (no DB write on preview), REQ-07 (error file download), REQ-12 (v2 independent path)
  - Accept: separate import path from v1 (`src/shared/ui/components/ExcelImportDialog.tsx` untouched)
  - Dependencies: T-08

---

## Phase 3 — Categories Module [PR2]

Depends on Phase 2 (PR1b merged). Implements the first v2 consumer.

- [x] T-10 — CREATE `src/app/(dashboard)/settings/categories/import/config.client.ts` (~15 LOC)
  - Exports `{ moduleKey: 'categories', displayName: 'Categorías', columns }` — client-safe only (no Prisma)
  - `columns` = the 5 column defs from design §4 (Nombre, Prefijo, Descripción, Vida útil, Categoría padre)
  - Design §5 (config split rationale). Spec: REQ-10 (five columns, no fieldConfig)
  - Accept: no Prisma import; importable in a Client Component without build error
  - Dependencies: T-01

- [x] T-11 — CREATE `src/app/(dashboard)/settings/categories/import/config.ts` (~45 LOC)
  - Server-only. Exports `categoriesImportConfig: ExcelImportConfig<CategoryImportRow>`
  - `moduleKey: 'categories'`, `sheetName: 'Categorías'`, `maxRows: 5000`, full 5-column defs
  - `masterValidations`: parentName lookup via `prisma.category.findMany({ where: { name: { in: values } } })`
  - `rowTransformer`: trim + `toUpperCase` prefix, null-coalesce optional fields, maps `parentName → parentId`
  - `handler`: `bulkCreateCategories` (from T-12)
  - Design §4. Spec: REQ-10, REQ-11 (parent resolution), REQ-05 (master validation)
  - Accept: parentName not found → row error "Categoría padre no existe"; fieldConfig excluded from columns
  - Dependencies: T-01, T-12

- [x] T-12 — CREATE `src/app/(dashboard)/settings/categories/import/bulk-create.ts` (~45 LOC)
  - Exports `bulkCreateCategories(rows: CategoryImportRow[], userId: string): Promise<ImportConfirmResult>`
  - Pre-resolves parentName → id in ONE query before loop; row-isolated try/catch on `prisma.category.create`
  - Maps Prisma P2002 to Spanish per-row error message; calls `writeImportLog('Category', result, userId, fileName)` before return
  - Design §4. Spec: REQ-08 (ImportLog, COMPLETED/FAILED), REQ-11 (parentId: null for empty parent)
  - Accept: never throws; P2002 appears in result.errors; ImportLog written exactly once per invocation
  - Dependencies: T-01, T-03

- [x] T-13 — MODIFY `src/shared/excel-import/registry.ts` → add categories registration (~3 LOC added)
  - Add `import { categoriesImportConfig } from '@/app/(dashboard)/settings/categories/import/config'`
  - Add `registry.set(categoriesImportConfig.moduleKey, categoriesImportConfig as ExcelImportConfig<unknown>)`
  - Design §2 (registry, explicit imports). Spec: REQ-02 (module config registered by moduleKey)
  - Accept: `getImportConfig('categories')` returns config; no other registry callers affected
  - Dependencies: T-02, T-11

- [x] T-14 — MODIFY `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx` (~25 LOC added)
  - Add `useState` for `importOpen`; add import button (Lucide `Upload` icon, Spanish label "Importar Excel", `canWrite` guard)
  - Mount `<ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} moduleKey="categories" title="Importar categorías" onSuccess={() => router.refresh()} />`
  - Import `ExcelImportDialog` from `@/shared/excel-import/components/ExcelImportDialog` (v2 path, NOT v1)
  - Import `categoriesImportClientConfig` from `./import/config.client` for column hints prop
  - Design §5. Spec: REQ-12 (v1 untouched, v2 independent), REQ-03 (canWrite guard on button)
  - Accept: v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` has zero diffs
  - Dependencies: T-09, T-10, T-13

---

## Phase 4 — Verification [post-PR2]

Manual smoke tests. No code produced — acceptance gate only.

- [x] T-15 — Run `pnpm lint` + `pnpm build` on each PR branch independently
  - PR1a: all 7 new files pass lint/typecheck with no Prisma in client paths
  - PR1b: actions.ts + dialog compile; dialog does NOT import from `config.ts` (only `config.client.ts`)
  - PR2: `pnpm build` succeeds; no "Prisma bundled in browser" error
  - Spec: REQ-12 (all 3 PRs independently mergeable)
  - Dependencies: T-14

- [ ] T-16 — Manual smoke test: happy path
  - Build a 10-row valid `.xlsx` (sheet "Categorías", five columns, all valid)
  - Upload via CategoriesTablePage → preview → `validCount: 10, errorCount: 0`, no error file
  - Confirm → 10 `Category` rows inserted; one `ImportLog` with `status: COMPLETED, successRows: 10, errorRows: 0`
  - Spec: REQ-01, REQ-08, REQ-10
  - Dependencies: T-15

- [ ] T-17 — Manual smoke test: error path
  - Build a 10-row `.xlsx` with 3 type errors (non-numeric `Vida útil`) + 1 non-existent parent name
  - Preview → error file returned; 4 rows in errors list; "Categoría padre no existe" in one row
  - Confirm never called → zero DB writes during preview
  - Spec: REQ-04, REQ-05, REQ-07, REQ-11
  - Dependencies: T-15
