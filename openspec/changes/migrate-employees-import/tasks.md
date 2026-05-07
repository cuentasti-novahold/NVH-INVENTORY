# Tasks: migrate-employees-import

**Project**: nvh-inventory · **Change**: migrate-employees-import · **Phase**: sdd-tasks (hybrid)
**Depends on**: proposal (#199) · spec (#200) · design (#201) · explore (#198)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~385 (205 added + 180 deleted) |
| 400-line budget risk | **Low** — single PR within budget |
| Chained PRs recommended | **No** |
| Suggested split | Single PR (cohesive: add v2, remove v1, swap mount) |
| Delivery strategy | `auto-chain` (1 work unit) |
| Decision needed before apply | **No** |

---

## Phase 1 — Implementation [Single PR]

All tasks are sequential. Each task depends on the prior unless noted. Apply executes in T-NN order.

- [ ] **T-01** — CREATE `src/app/(dashboard)/employees/import/config.client.ts` (~45 LOC)
  - **What**: 8-column definition file — client-safe, no Prisma imports
  - **Exports**: `employeesImportColumns: ColumnDef[]`, `employeesImportDisplayName = 'Empleados'`, `employeesImportModuleKey = 'employees'`
  - **Columns** (key → header → type → required → maxLength → width → example):
    - `fullName` → `Nombre completo*` → string → true → 120 → 30 → `Ana García`
    - `email` → `Correo*` → email → true → 160 → 30 → `ana@empresa.com`
    - `phone` → `Teléfono` → string → false → 40 → 18 → `+57 300 123 4567`
    - `position` → `Cargo` → string → false → 120 → 22 → `Analista`
    - `departmentName` → `Departamento` → string → false → 120 → 22 → `Tecnología`
    - `cityName` → `Ciudad` → string → false → 100 → 20 → `Bogotá`
    - `locationName` → `Sede` → string → false → 100 → 20 → `Oficina Principal`
    - `isActive` → `Activo` → boolean → false → — → 12 → `SI`
  - **Spec**: REQ-13 (8 columns, exact keys)
  - **Design**: §2 (column table with all widths/examples)
  - **Accept**: file imports cleanly in a Client Component; no `prisma` import present; `rg "from.*prisma"` returns 0 in this file
  - **Dependencies**: none

- [ ] **T-02** — CREATE `src/app/(dashboard)/employees/import/bulk-create.ts` (~90 LOC)
  - **What**: handler that writes employees to DB — 3 parallel FK pre-resolve maps, row-isolated loop, inline P2002 detection
  - **Signature**: `bulkCreateEmployees(rows: EmployeeImportRow[], userId: string, fileName: string): Promise<ImportConfirmResult>`
  - **Steps**:
    1. Dedupe non-null dept/city/loc names from rows
    2. `Promise.all([dept.findMany, city.findMany, loc.findMany])` with `where: { name: { in: values } }` — 3 queries in parallel
    3. Build `deptMap`, `cityMap`, `locMap` (name → id)
    4. Loop each row with isolated `try/catch`:
       - Defense-in-depth: if FK name set but Map miss → push row error, `continue`
       - `prisma.employee.create({ data: { fullName, email, phone, position, isActive, departmentId?, cityId?, locationId? } })`
       - Catch `e`: `(e as any)?.code === 'P2002' && String((e as any)?.meta?.target ?? '').includes('email')` → `'Correo duplicado'`; `(e as any)?.code === 'P2002'` → `'Duplicado'`; else generic message
    5. `await writeImportLog('Employee', result, userId, fileName)`
  - **CRITICAL**: do NOT use `isP2002(e, '')` for generic P2002 — empty string matches everything via `String.includes('')`. Use direct `code === 'P2002'` equality check (Design §4 precision fix).
  - **Spec**: REQ-13 (employee fields), REQ-17 (email dup → row error, batch continues), REQ-20 (ImportLog with real fileName)
  - **Design**: §4 (bulk-create signature + P2002 note + writeImportLog call)
  - **Accept**: never throws; P2002 on email → `'Correo duplicado'` in result.errors; `ImportLog` written once per invocation with real `fileName`; `successRows + errorRows === totalReceived`
  - **Dependencies**: T-01

- [ ] **T-03** — CREATE `src/app/(dashboard)/employees/import/config.ts` (~70 LOC)
  - **What**: server-only config wiring — masterValidations, rowTransformer, handler reference
  - **Exports**: `employeesImportConfig: ExcelImportConfig<EmployeeImportRow>`
  - **Config fields**:
    - `entity: 'Employee'`, `moduleKey: 'employees'`, `sheetName: 'Empleados'`, `maxRows: 5000`
    - `columns`: same 8 as `config.client.ts`
    - `displayName: 'Empleados'`
  - **masterValidations** (3, in this order):
    1. `key: 'departmentName'` → `prisma.department.findMany({ where: { name: { in: values } }, select: { name: true } })` → error `'Departamento no existe'`
    2. `key: 'cityName'` → `prisma.city.findMany({ where: { name: { in: values } }, select: { name: true } })` → error `'Ciudad no existe'`
    3. `key: 'locationName'` → `prisma.location.findMany({ where: { name: { in: values } }, select: { name: true } })` → error `'Sede no existe'`
  - **rowTransformer**: trim all strings, `email.toLowerCase()`, `trimOrNull()` for optionals, `parseBool` for isActive (`SI`/`NO`/`TRUE`/`FALSE`/`1`/`0`/`inactivo`, blank → `true`)
  - **handler**: `bulkCreateEmployees` (from T-02)
  - **Spec**: REQ-13 (entity/moduleKey/sheetName), REQ-14 (dept exact match), REQ-15 (city exact match), REQ-16 (location exact match)
  - **Design**: §3 (full config structure)
  - **Accept**: `getImportConfig('employees')` returns this config after T-04; `departmentName: 'Marketnig'` → error `'Departamento no existe'`; empty `departmentName` → `departmentId: null`, no error
  - **Dependencies**: T-01, T-02

- [ ] **T-04** — MODIFY `src/shared/excel-import/registry.ts` (~+3 LOC)
  - **What**: register employees config so `getImportConfig('employees')` resolves at runtime
  - **Changes**:
    - Add import: `import { employeesImportConfig } from '@/app/(dashboard)/employees/import/config';`
    - Add registration: `register(employeesImportConfig as ExcelImportConfig<unknown>);`
    - Use `register(...)` helper if it exists, else `registry.set(employeesImportConfig.moduleKey, ...)` — mirror exactly how `categoriesImportConfig` is registered
  - **Spec**: REQ-13 (employees module accessible via moduleKey)
  - **Design**: §6 (registry snippet)
  - **Accept**: `getImportConfig('employees')` no longer throws; categories registration untouched
  - **Dependencies**: T-03

- [ ] **T-05** — MODIFY `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` (~+5 / -20 net)
  - **What**: swap v1 dialog mount for v2 dialog mount
  - **Remove imports**:
    - `import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog';` (v1 path)
    - `import { importEmployeesAction } from '../../actions';`
    - `EmployeeImportRow` from the DTO type import line (keep other types from that import)
  - **Add import**:
    - `import { ExcelImportDialog } from '@/shared/excel-import/components/ExcelImportDialog';` (v2 path)
    - (`useRouter` already imported — no change needed)
  - **Replace** the v1 dialog mount (lines 224–246 approx.) with:
    ```tsx
    <ExcelImportDialog
      open={dialogs.importOpen}
      onOpenChange={(open) => setDialogs((s) => ({ ...s, importOpen: open }))}
      moduleKey="employees"
      title="Importar empleados"
      onSuccess={() => router.refresh()}
    />
    ```
  - **No changes**: `dialogs` state shape, `canWrite`, toolbar button, `useRouter` import
  - **Spec**: REQ-12 modified (EmployeesTablePage now v2 consumer), REQ-18 (no `importEmployeesAction` mount), REQ-19 (v1 dialog file untouched)
  - **Design**: §5 (exact replacement JSX)
  - **Accept**: v2 dialog mounts with `moduleKey="employees"`; no `parseRow` / `action` props present; v1 `ExcelImportDialog` import path removed
  - **Dependencies**: T-04

- [ ] **T-06** — MODIFY `src/app/(dashboard)/employees/presentation/dto/employee.dto.ts` (~-9 LOC)
  - **What**: delete `EmployeeImportRow` interface — exclusive to v1, zero callers after T-05
  - **Before deleting**: run `rg "EmployeeImportRow" src/` to confirm only 0–1 results (the DTO declaration itself); if any other file imports it, STOP and report
  - **Delete**: the `EmployeeImportRow` export interface (lines 32–41 approx.) — keep `EmployeeRow`, `CreateEmployeeDTO`, `UpdateEmployeeDTO`
  - **Spec**: REQ-18 (EmployeeImportRow must not exist after change)
  - **Design**: §7 (DTO cleanup)
  - **Accept**: `rg "EmployeeImportRow" src/` → 0 results; file compiles; other DTO exports unchanged
  - **Dependencies**: T-05

- [ ] **T-07** — MODIFY `src/app/(dashboard)/employees/actions.ts` (~-160 LOC)
  - **What**: delete `importEmployeesAction` function + `toBool` helper + their exclusive imports
  - **Step 1 — identify shared imports** (run BEFORE editing):
    - `rg "Prisma" src/app/\(dashboard\)/employees/actions.ts` — check if `Prisma` type used outside deleted code
    - `rg "ExcelImportResult\|ExcelRowError" src/app/\(dashboard\)/employees/` — likely exclusive to deleted action; remove import if so
    - `rg "revalidatePath" src/app/\(dashboard\)/employees/actions.ts` — KEEP if used by other actions (create/update/delete)
    - `rg "yup" src/app/\(dashboard\)/employees/actions.ts` — KEEP if used by other validation logic
    - `EmployeeImportRow` import line — REMOVE (DTO deleted in T-06)
  - **Step 2 — delete**:
    - Section banner `// ── IMPORT ──` (line 372 approx.)
    - `toBool` helper (lines 374–379 approx.)
    - `importEmployeesAction` function body (lines 381–521 approx.)
  - **Step 3 — remove exclusive imports** identified in Step 1 (only those confirmed exclusive)
  - **KEEP**: `prisma`, `requireWrite`, `auth`, `hasPermission`, `revalidatePath`, `yup` — all used by other actions
  - **Spec**: REQ-18 (importEmployeesAction must not exist)
  - **Design**: §6 (cleanup scope + import inspection guidance)
  - **Accept**: `rg "importEmployeesAction" src/` → 0 results; `rg "toBool" src/app/\(dashboard\)/employees/` → 0 results; `pnpm tsc --noEmit` passes; no type errors in remaining actions
  - **Dependencies**: T-06

---

## Phase 2 — Verification [Post-PR]

Manual acceptance gate. No code produced.

- [ ] **T-08** — RUN `pnpm lint`
  - Confirm zero new ESLint errors or warnings introduced by this change
  - Scope: files touched in T-01..T-07 only — do not count pre-existing warnings
  - **Spec**: general quality gate
  - **Dependencies**: T-07

- [ ] **T-09** — RUN `pnpm tsc --noEmit`
  - Confirm zero new TypeScript errors across the project after cleanup
  - Pay special attention to: `actions.ts` (removed imports), `employee.dto.ts` (removed interface), `EmployeesTablePage.tsx` (changed dialog type)
  - **Spec**: general quality gate
  - **Dependencies**: T-07

- [ ] **T-10** — SMOKE happy path (user-driven)
  - Build a 5-row `.xlsx` with sheet `Empleados`, all 8 columns, valid data (departments/cities/locations must already exist in DB)
  - Upload via EmployeesTablePage → preview → `validRows: 5, errorCount: 0`
  - Confirm → 5 `Employee` rows inserted; one `ImportLog` with `entity: 'Employee'`, `fileName` = real upload filename, `status: COMPLETED`
  - **Spec**: REQ-13, REQ-20 (real fileName, not hardcoded)
  - **Dependencies**: T-09

- [ ] **T-11** — SMOKE error path (user-driven)
  - Build a `.xlsx` with: 1 row with dept name typo, 1 row with city not found, 1 row with email already in DB, 2 valid rows
  - Preview → 3 error rows with messages `'Departamento no existe'`, `'Ciudad no existe'`, `'Correo duplicado'`; 2 valid rows shown
  - Confirm → 2 rows inserted; error file downloadable; `ImportLog` with `successRows: 2, errorRows: 3, status: COMPLETED`
  - **Spec**: REQ-14, REQ-15, REQ-17, REQ-20
  - **Dependencies**: T-09

- [ ] **T-12** — REGRESSION CHECK assets import (user-driven)
  - Navigate to `/assets` (or wherever AssetsTablePage is mounted)
  - Click "Importar Excel" → confirm v1 `ExcelImportDialog` still opens and functions identically
  - `rg "shared/ui/components/ExcelImportDialog" src/` → still imported by AssetsTablePage only
  - **Spec**: REQ-19 (assets coexistence — v1 untouched)
  - **Dependencies**: T-09
