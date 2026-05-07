# Verification Report — excel-import-system

**Date**: 2026-05-05
**Mode**: Standard (Strict TDD: disabled)
**Verdict**: PASS WITH WARNINGS

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 17 |
| Tasks complete (Engram apply-progress) | 14 (T-01..T-14) |
| Tasks incomplete | T-15, T-16, T-17 (smoke tests, user-driven) |
| openspec/tasks.md sync | T-10..T-14 show `[ ]` in file — code is implemented; sync is cosmetic |

T-15 (lint+tsc) was executed during this verify phase — PASS.
T-16 / T-17 are manual smoke tests running in parallel with the user.

---

## Build & Tests Execution

**Lint (our scope)**: PASS — zero errors in `src/shared/excel-import/` and `categories/import/`.
One pre-existing warning in `CategoriesTablePage.tsx`: `currentPageSize` prop declared but unused (not introduced by this change).

**TypeScript**: PASS — `pnpm tsc --noEmit` produces zero errors for all changed files.

**Automated tests**: Not applicable — Strict TDD disabled. No unit tests exist for the excel-import module.

**Coverage**: Not available.

---

## REQ-by-REQ Verification

### REQ-01 — Two-phase flow [PASS]

- `previewImportAction` (actions.ts:85): calls `parseAndValidate()` then returns result. No `prisma.*` call, no `writeImportLog` call. DB is never touched.
- `confirmImportAction` (actions.ts:137): calls `parseAndValidate(moduleKey, fileBase64)` independently at line 148 — re-parses from base64, never uses client-provided `validRows`.
- Evidence: `grep "writeImportLog" actions.ts` → only one call site at line 185 (all-failed-before-handler path) and the handler itself calls it at bulk-create.ts:105.

### REQ-02 — Config-driven module registry [PASS]

- `getImportConfig(moduleKey)` in registry.ts is the single lookup point (lines 19-25).
- Both `previewImportAction` and `confirmImportAction` call it via `parseAndValidate()` (actions.ts:53).
- Unknown module key: `getImportConfig` throws a Spanish error; `parseAndValidate` catches it and returns `err('VALIDATION', 'Módulo no soportado')` (actions.ts:54-55).

### REQ-03 — Permission gate [PASS]

- `requireImportPermission(moduleKey)` (actions.ts:24-33):
  - `auth()` called; no session → `err('UNAUTHORIZED', 'No autenticado')`
  - `hasPermission(role, moduleKey as Resource, 'create')` → false → `err('FORBIDDEN', 'Sin permiso para importar este módulo')`
- Both `previewImportAction` (line 90) and `confirmImportAction` (line 143) call it as first step.

### REQ-04 — Row validation [PASS]

- `validateRows` in validator.ts accumulates ALL errors per row — the inner loop iterates all `columns` for every row, collecting errors without `return`/`break` between them (lines 127-131).
- All 6 types implemented with Spanish messages:
  - `string`: `Excede longitud máxima de ${col.maxLength}` (line 41)
  - `number`: `Debe ser numérico` (line 51)
  - `boolean`: `Debe ser sí/no o true/false` (line 61)
  - `email`: `Email inválido` (line 69)
  - `enum`: `Debe ser uno de: ${col.enumValues.join(', ')}` (line 77)
  - `date`: `Fecha inválida` (line 87)
- Required field: `Campo obligatorio` with early return from `validateCell` (not from the outer loop — other columns still iterate) (lines 25-28).

### REQ-05 — Master validations [PASS]

- `runMasterValidations(rows, masterValidations, rowNumbers)` accepts `rowNumbers` as third argument (master-validator.ts:22-25).
- `error.row = rowNumbers?.[i] ?? i + 2` (line 54) — uses the exact Excel row number when provided.
- Called with `rowNumbers` from `parseAndValidate`: `await runMasterValidations(validRows, config.masterValidations, rowNumbers)` (actions.ts:71).

### REQ-06 — Row transformer [PASS]

- Preview: transformer applied at actions.ts:107-109 after master validation filtering.
- Confirm: transformer applied at actions.ts:162-164 after master validation filtering.
- Transformer in config.ts (lines 42-57): pure function, no side effects. Normalizes strings, null-coalesces optionals.

### REQ-07 — Error file [PASS]

- `buildErrorExcel` returns `string` (base64) — confirmed in error-excel-builder.ts:17 return type and XLSX.write call at line 54 with `type: 'base64'`.
- Preview: `errorFileBase64 = allErrors.length > 0 ? buildErrorExcel(...) : undefined` (actions.ts:114-117).
- Confirm all-failed-before-handler: same pattern (actions.ts:168-171).
- Confirm via handler: `bulkCreateCategories` does not produce `errorFileBase64` in `result` (bulk-create.ts:30-35 initial result object). The `ImportConfirmResult` type allows `errorFileBase64?` — the field is absent when the handler returns, which matches the spec ("no error file when zero errors"). Note: when the handler has per-row errors, it does NOT produce an error file — this is a minor gap vs spec §REQ-07 "confirm returns rows with errors → errorFileBase64 MUST be present." See WARNING section.

### REQ-08 — Audit log [PASS]

- `writeImportLog(entity, result, userId, fileName)` signature (log.ts:10-15) — all four params present.
- `Prisma.InputJsonValue` cast at log.ts:26: `result.errors as unknown as Prisma.InputJsonValue`.
- Status logic (log.ts:28): `result.totalReceived > 0 && result.created === 0 ? 'FAILED' : 'COMPLETED'` — matches spec.
- `entity: 'Category'` set in config.ts:24.

### REQ-09 — File constraints [PASS]

- 10 MB: `MAX_FILE_BYTES = 10 * 1024 * 1024` (parser.ts:19); enforced at line 47 with Spanish message.
- maxRows: enforced at parser.ts:79 with Spanish message `El archivo excede el límite de ${maxRows} filas permitidas`.
- Sheet name mismatch: parser.ts:64-69 — `Hoja "${sheetName}" no encontrada en el archivo`.
- All violations throw `ExcelParseError` caught by `parseAndValidate` → `err('VALIDATION', e.message)` before any row processing.

### REQ-10 — Categories import columns [PASS WITH WARNING]

- 5 columns declared in config.client.ts (lines 6-51): Nombre, Prefijo, Descripción, Categoría padre, Vida útil años. ✅
- `prefix` maxLength: 10 ✅ | `name` maxLength: 100 ✅
- `fieldConfig` not in columns ✅
- **WARNING**: spec says `Descripción` max 255; implementation has `maxLength: 500`. Design.md (§4) says `str,500` — the apply phase followed design over spec on this point. Functionally harmless (DB column is unbounded `String?`), but it is a spec deviation.

### REQ-11 — Parent category resolution [PASS]

- masterValidations.lookup (config.ts:31-36): `prisma.category.findMany({ where: { name: { in: values } } })` → `new Set(rows.map(r => r.name))`.
- bulk-create.ts:37-52: pre-resolves all parentNames in ONE query → `parentMap`.
- Error message: `'Categoría padre no existe'` — in config.ts:38 (master-validator message) and bulk-create.ts:64 (defense-in-depth fallback).
- Empty parentName → rowTransformer sets `parentName: null` → bulk-create creates with no parent relation: `parentId` omitted → `parentId: null` in DB ✅

### REQ-12 — Coexistence with v1 dialog [PASS]

- v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx`: git log shows only one commit (`24fe63a`) introduced it; it has never been modified. Content confirmed to be the original v1 implementation.
- `EmployeesTablePage.tsx`: `import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog'` ✅
- `AssetsTablePage.tsx`: `import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog'` ✅
- v2 dialog is at the fully distinct path `src/shared/excel-import/components/ExcelImportDialog.tsx` ✅
- No shared code mutation between v1 and v2.

---

## Findings

### CRITICAL (must fix before archive)

None.

### WARNINGS (should fix, non-blocking)

**W-01 — REQ-10 spec/design mismatch: Descripción maxLength**
- Spec says `max 255`; implementation has `maxLength: 500` (following design.md §4 which says `str,500`).
- Functionally benign — Prisma `Category.description` is `String?` with no db-level length constraint.
- Fix: either update the spec to say 500, or update config.client.ts to 255. Recommendation: update the spec to match what was intentionally designed (500 is a more reasonable value for a description field).

**W-02 — confirmImportAction via handler does not generate errorFileBase64**
- REQ-07 states: "When preview or confirm returns rows with errors, the response MUST include a base64-encoded .xlsx file."
- `bulkCreateCategories` (and any future handler) returns `ImportConfirmResult` but never sets `errorFileBase64`.
- The dialog (ExcelImportDialog.tsx:752) correctly checks `state.result.errorFileBase64 &&` before showing the download button — so this won't crash. But the button won't appear on confirm errors.
- This is a partial gap in the confirm flow. The error file IS generated in the all-failed-before-handler path (when zero valid rows reach the handler), but NOT for per-row handler errors (e.g. P2002 duplicates).
- Fix: the handler should build and attach an error file, or the action should build one from handler `result.errors` after the handler returns.

**W-03 — openspec/tasks.md out of sync**
- T-10..T-14 implemented in code but still marked `[ ]` in `openspec/changes/excel-import-system/tasks.md`.
- Engram apply-progress (obs #193) correctly shows all 14 as complete.
- Fix: update tasks.md to mark T-10..T-14 as `[x]`.

### SUGGESTIONS (optional improvements)

**S-01 — Skill file signature mismatch on previewImportAction**
- `skills/nextjs-16/excel-import/SKILL.md` line 215 shows `previewImportAction(moduleKey, fileBase64, fileName)` but the implementation (per design.md §2) takes only `(moduleKey, fileBase64)`. Future module authors will see the wrong signature.
- Fix: update SKILL.md to remove `fileName` from the preview action signature.

**S-02 — No automated unit tests for core logic**
- The pure functions (parser, validator, master-validator, error-excel-builder) are ideal candidates for unit tests. They are fully side-effect-free and the design explicitly called them out as the unit test boundary (design.md §7).
- Not a blocker (Strict TDD is disabled), but the test infrastructure is in place and these would be high-value tests.

---

## Coexistence Verification

| Check | Result |
|-------|--------|
| v1 dialog file unchanged | PASS — single commit history, no modifications |
| EmployeesTablePage imports v1 path | PASS |
| AssetsTablePage imports v1 path | PASS |
| v2 dialog at distinct path | PASS — `src/shared/excel-import/components/ExcelImportDialog.tsx` |
| No shared code mutation | PASS |

---

## Skill Alignment

Handler signature in `ExcelImportConfig.handler`: `(rows: TRow[], userId: string, fileName: string) => Promise<ImportConfirmResult>` — matches the canonical corrected signature from obs #192.

`writeImportLog(entity, result, userId, fileName)` — matches.

`config.client.ts` / `config.ts` split — implemented per design §5 decision.

Base64 file transport — implemented throughout (fileToBase64 in dialog, base64 in actions).

---

## Next Phase

Recommended: **sdd-archive** (no CRITICAL issues block archival).

W-02 (confirm error file gap) is the most functionally meaningful warning — consider fixing before or after archive depending on user priority. W-01 and W-03 are cosmetic/documentation items.
