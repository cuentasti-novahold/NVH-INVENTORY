# Verify Report: migrate-employees-import

**Change**: migrate-employees-import
**Spec**: delta REQ-12..REQ-20 (`openspec/changes/migrate-employees-import/specs/excel-import.md`)
**Mode**: Standard (Strict TDD disabled)
**Date**: 2026-05-07
**Verdict**: PASS

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 12 (T-01..T-12) |
| Core tasks complete | 7/7 (T-01..T-07) |
| Manual/smoke pending | 5 (T-08..T-12 — user-driven gates) |

T-08 (`pnpm lint`) and T-09 (`pnpm tsc --noEmit`) confirmed clean by orchestrator pre-verify. T-10..T-12 are user-driven smoke tests, out of automated scope.

---

## Build & Type Check

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | Passed (orchestrator confirmed, 0 errors) |
| `pnpm lint` | Passed (0 new issues in changed files) |
| Tests | N/A — no test runner configured |
| Coverage | N/A |

---

## Spec Compliance Matrix

| REQ | Description | Status | Evidence |
|-----|-------------|--------|----------|
| REQ-12 | EmployeesTablePage uses v2 dialog; v1 dialog untouched | PASS | Import: `@/shared/excel-import/components/ExcelImportDialog`; git diff on v1 file = empty |
| REQ-13 | 8 columns, exact keys; entity/moduleKey/sheetName correct | PASS | `config.ts:24-29` — entity='Employee', moduleKey='employees', sheetName='Empleados'; 8 columns in config.client.ts |
| REQ-14 | departmentName exact match; error 'Departamento no existe' | PASS | `config.ts:33-42` masterValidation; defense-in-depth in `bulk-create.ts:84-92` |
| REQ-15 | cityName exact match; error 'Ciudad no existe' | PASS | `config.ts:43-52` masterValidation; defense-in-depth in `bulk-create.ts:93-101` |
| REQ-16 | locationName exact match; error 'Sede no existe' | PASS | `config.ts:53-64` masterValidation; defense-in-depth in `bulk-create.ts:102-110` |
| REQ-17 | P2002/email → 'Correo duplicado'; batch continues | PASS | `bulk-create.ts:126-144` row-isolated catch; `isP2002(e, 'email')` → 'Correo duplicado'; loop never breaks |
| REQ-18 | importEmployeesAction, toBool, v1 EmployeeImportRow removed | PASS | `rg "importEmployeesAction" src/` → 0 results; `rg "toBool" employees/` → 0; v1 DTO gone from `employee.dto.ts` |
| REQ-19 | v1 ExcelImportDialog untouched; AssetsTablePage sole v1 consumer | PASS | git diff = empty on v1 file; AssetsTablePage is only consumer of `@/shared/ui/components/ExcelImportDialog` |
| REQ-20 | writeImportLog receives real fileName | PASS | `bulk-create.ts:147`: `writeImportLog('Employee', result, userId, fileName)` |

---

## Critical Gotchas

| Gotcha | Result | Evidence |
|--------|--------|----------|
| P2002 precision: no `isP2002(e, '')` in generic fallback | PASS | `bulk-create.ts:132`: `(e as { code?: string })?.code === 'P2002'` — direct equality, not `isP2002(e, '')` |
| Real fileName (not hardcoded) | PASS | `bulkCreateEmployees(rows, userId, fileName: string)` — passed as 4th arg to writeImportLog |
| v1 file untouched | PASS | `git diff HEAD -- src/shared/ui/components/ExcelImportDialog.tsx` = (empty) |
| v2 dialog mount props | PASS | Props: moduleKey="employees", title, open, onOpenChange, onSuccess — no parseRow, no action |
| Registry parity with categories | PASS | Lines 29-30: `register(categoriesImportConfig...)` then `register(employeesImportConfig...)` |

---

## Coherence (Design Decisions)

| ADR | Decision | Followed? |
|-----|----------|-----------|
| ADR-1 | Department error-if-not-found (not upsert) | Yes — masterValidation only, no upsert in bulkCreate |
| ADR-2 | City/Location exact `in` match | Yes — both use `findMany({ where: { name: { in: values } } })` |
| ADR-3 | Single-PR cleanup of v1 | Yes — importEmployeesAction, toBool, EmployeeImportRow all removed |
| ADR-4 | isP2002(e, '') replaced by direct code equality | Yes — Design §4 correction correctly applied |
| ADR-5 | router.refresh() not revalidatePath | Yes — `onSuccess={() => router.refresh()}` in EmployeesTablePage |

---

## Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- S-01: Design §2 specifies `maxLength: 160` for email column in `config.client.ts`. The `EmailColumnDef` type does not accept `maxLength`, so the field was correctly omitted in the post-apply fix. Consider updating design §2 docs to reflect the actual type contract. Documentation-only impact.
- S-02: Design table said to KEEP `import * as yup` in `actions.ts`. It was safely removed because schemas are imported via their own file — no direct yup usage remained. Behavior is correct; design note was overly conservative.

---

## Verdict

**PASS** — 9/9 requirements (REQ-12..REQ-20) fully implemented and statically verified. 0 CRITICAL. 0 WARNING. 2 SUGGESTIONS (documentation only). Ready for `sdd-archive`.
