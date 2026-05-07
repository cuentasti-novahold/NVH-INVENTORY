# Delta for Excel Import — Employees Module

**Change**: `migrate-employees-import` · **Extends**: `openspec/specs/excel-import/spec.md` (REQ-01..REQ-12)
**REQs added**: REQ-13..REQ-20 · **REQs modified**: REQ-12

> This delta does NOT re-state REQ-01..REQ-11 (already satisfied by the v2 infrastructure). It pins employees-specific behavior and documents 3 breaking changes vs v1.

---

## Breaking Changes vs v1

| # | Area | v1 behavior | v2 behavior |
|---|------|------------|------------|
| BC-1 | Department | `upsert` — crea departamento si no existe | Error si no existe: `'Departamento no existe'` |
| BC-2 | City match | `findFirst { contains }` — match parcial | `in` — match exacto solamente |
| BC-3 | Location match | `findFirst { contains }` — match parcial | `in` — match exacto solamente |

---

## ADDED Requirements

### REQ-13 — Employees import columns

The employees import MUST accept exactly eight columns: `fullName` (string, required, max 120), `email` (email, required, max 160), `phone` (string, optional, max 40), `position` (string, optional, max 120), `departmentName` (string, optional, max 120), `cityName` (string, optional, max 100), `locationName` (string, optional, max 100), `isActive` (boolean, optional). No other columns are accepted.

#### Scenario: Valid 8-column file — full batch

- GIVEN an ADMIN user and a `.xlsx` with the 8 declared columns and 50 valid rows
- WHEN submitted for preview
- THEN the response shows `validRows: 50`, `errorCount: 0`
- AND no records are written to the database

#### Scenario: Column key rename rejected

- GIVEN a file using the legacy column keys `department`, `city`, `location` (v1 names)
- WHEN submitted for preview
- THEN those FK columns are treated as unknown and their values are ignored
- AND FK lookups are not executed for unrecognized column keys

---

### REQ-14 — Department resolution

When `departmentName` is provided, it MUST be resolved to an existing department by exact name match (`in`). If the value is provided and no matching department is found, the row MUST fail with the error `'Departamento no existe'`. When `departmentName` is empty or absent, the employee MUST be created with `departmentId: null` — this MUST NOT produce a row error.

#### Scenario: Department not found — row error

- GIVEN a file where one row has `departmentName: 'Marketnig'` (typo) and no department with that exact name exists
- WHEN the file is submitted for preview
- THEN that row appears in the errors list with the message `'Departamento no existe'`
- AND the row is excluded from confirm

#### Scenario: Empty department — no error

- GIVEN a file where one row has an empty `departmentName` cell
- WHEN confirm is executed
- THEN the employee is created with `departmentId: null`
- AND no row error is produced for that row

---

### REQ-15 — City resolution (exact match)

When `cityName` is provided, it MUST be resolved by exact name match (`in`). If the value is provided and no matching city is found, the row MUST fail with the error `'Ciudad no existe'`. Partial matches (`Bog` for `Bogotá`) MUST NOT resolve. When `cityName` is empty or absent, the employee MUST be created without a city assignment.

#### Scenario: City partial match no longer resolves

- GIVEN a file where a row has `cityName: 'Bog'` and only `'Bogotá'` exists in the database
- WHEN the file is submitted for preview
- THEN that row fails with the error `'Ciudad no existe'`

#### Scenario: City exact match succeeds

- GIVEN a file where a row has `cityName: 'Bogotá'` and `'Bogotá'` exists in the database
- WHEN submitted for preview
- THEN that row is valid and the resolved `cityId` is carried into confirm

---

### REQ-16 — Location/Sede resolution (exact match)

When `locationName` is provided, it MUST be resolved by exact name match (`in`). If the value is provided and no matching location is found, the row MUST fail with the error `'Sede no existe'`. Partial matches MUST NOT resolve. When `locationName` is empty or absent, the employee MUST be created without a location assignment.

#### Scenario: Location not found — row error

- GIVEN a file where a row has `locationName: 'Oficina Ppal'` and no location with that exact name exists
- WHEN submitted for preview
- THEN that row fails with the error `'Sede no existe'`

---

### REQ-17 — Email uniqueness — per-row error

When a row in the import file has an `email` that already exists in the `Employee` table, the system MUST catch the `P2002` constraint violation and report a row-level error with the message `'Correo duplicado'`. The failing row MUST NOT be inserted; all other valid rows in the batch MUST continue to be processed.

When two rows in the same import file share the same `email`, the first occurrence is processed normally. The second occurrence produces a `P2002` during bulk-create and is reported as `'Correo duplicado'`. Pre-flight detection within the file is NOT required.

#### Scenario: Email already in DB

- GIVEN a file where one row has `email: 'ana@empresa.com'` and that email already exists in the Employee table
- WHEN confirm is executed
- THEN that row fails with the error `'Correo duplicado'`
- AND all other valid rows in the batch are inserted

#### Scenario: Email duplicate within same file

- GIVEN a file where two rows have `email: 'ana@empresa.com'`
- WHEN confirm is executed
- THEN the first row is inserted successfully
- AND the second row fails with the error `'Correo duplicado'`

---

### REQ-18 — V1 action removal

After this change is applied, `importEmployeesAction` MUST NOT exist in `src/app/(dashboard)/employees/actions.ts`. The `EmployeeImportRow` interface MUST NOT exist in `employee.dto.ts`. The `toBool` helper MUST NOT exist (it was exclusive to the v1 action). `EmployeesTablePage` MUST mount the v2 `ExcelImportDialog` from `@/shared/excel-import/components/ExcelImportDialog` with `moduleKey="employees"`.

#### Scenario: V1 action removed

- GIVEN the codebase after this change is applied
- WHEN searching for `importEmployeesAction` via `rg`
- THEN no results are found in the repository

#### Scenario: V2 dialog mounted in EmployeesTablePage

- GIVEN the `EmployeesTablePage` component after this change
- WHEN a user with `canWrite` triggers the import button
- THEN the v2 `ExcelImportDialog` opens with `moduleKey="employees"`
- AND no `parseRow` or `action` prop is passed to the dialog

---

### REQ-19 — Assets coexistence

The v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` and its consumer `AssetsTablePage` MUST remain completely untouched by this change. The v1 types `ExcelImportResult` and `ExcelRowError` in `excel-import.types.ts` MUST NOT be deleted (assets still consumes them). Only the `EmployeeImportRow` interface — exclusive to the employees v1 flow — is removed.

#### Scenario: Assets import regression check

- GIVEN `AssetsTablePage` after this change is applied
- WHEN a user triggers the asset Excel import flow
- THEN the v1 `ExcelImportDialog` renders and functions identically to before this change
- AND no file under `src/shared/ui/components/` has been modified

---

### REQ-20 — Audit log with real fileName

The `ImportLog` row written on employees confirm MUST have `entity: 'Employee'` and MUST record the actual uploaded filename (e.g. `'mi-archivo.xlsx'`). The filename MUST NOT be hardcoded. If all rows fail, `status` MUST be `FAILED`; if at least one row succeeds, `status` MUST be `COMPLETED`.

#### Scenario: fileName captured correctly

- GIVEN a user uploads a file named `'mi-archivo.xlsx'` and confirm succeeds
- WHEN confirm completes
- THEN the `ImportLog` row has `entity: 'Employee'` and `fileName: 'mi-archivo.xlsx'`
- AND `fileName` is NOT the hardcoded value `'employees-import.xlsx'`

#### Scenario: Full success log

- GIVEN 50 valid rows submitted for confirm
- WHEN all 50 rows are inserted
- THEN `ImportLog` has `entity: 'Employee'`, `successRows: 50`, `errorRows: 0`, `status: 'COMPLETED'`

---

## MODIFIED Requirements

### REQ-12 — Coexistence with v1 dialog

(Previously: both `EmployeesTablePage` and `AssetsTablePage` were v1 consumers. After `migrate-employees-import`, only `AssetsTablePage` remains a v1 consumer.)

The v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` MUST remain unchanged and fully functional. `AssetsTablePage` MUST continue to use it without modification. `EmployeesTablePage` MUST transition to the v2 dialog (`moduleKey="employees"`); the v1 dialog MUST NOT be mounted in `EmployeesTablePage` after this change.

#### Scenario: v1 assets import continues to work

- GIVEN `AssetsTablePage` after `migrate-employees-import` is applied
- WHEN a user triggers the asset import
- THEN the v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` is rendered
- AND the import executes identically to before this change

#### Scenario: v2 employees import is active

- GIVEN `EmployeesTablePage` after `migrate-employees-import` is applied
- WHEN a user triggers the employee import
- THEN the v2 dialog from `@/shared/excel-import/components/ExcelImportDialog` is rendered
- AND the v1 `ExcelImportDialog` is NOT mounted in the employees flow

#### Scenario: VIEWER rejected for employees import

- GIVEN a user with VIEWER role
- WHEN the user calls preview for the `employees` module
- THEN the action returns `FORBIDDEN`
