# Excel Import System — Specification

**Project**: nvh-inventory · **Type**: New capability
**Specification Version**: 1.0
**Effective**: 2026-05-07

---

## Purpose

Define the behavioral contract for the v2 generic Excel import system and its first consumer: the `categories` module. This spec covers what the system MUST do — not how it is implemented.

---

## Requirements

### REQ-01 — Two-phase flow

The system MUST expose two distinct operations: `preview` and `confirm`. Preview MUST parse and validate the file without writing to the database. Confirm MUST only process rows that were validated; no row is inserted during preview.

#### Scenario: Preview success — valid file

- GIVEN a user with ADMIN role and a `.xlsx` file with 10 valid category rows
- WHEN the user submits the file for preview
- THEN the response includes the total row count, the valid row count, and an empty errors list
- AND no records are written to the database

#### Scenario: Preview does not mutate state

- GIVEN any valid import file
- WHEN `previewImportAction` is called multiple times with the same file
- THEN the database record count remains unchanged after each call

---

### REQ-02 — Config-driven module registry

Each module that supports import MUST declare a configuration object registered by a unique `moduleKey`. The Server Actions MUST look up the module config by `moduleKey` at runtime. Adding a new import module MUST NOT require changes to the shared Server Actions or dialog.

#### Scenario: Unknown module key

- GIVEN a caller that passes an unregistered `moduleKey`
- WHEN preview or confirm is invoked
- THEN the action returns a `VALIDATION` error with a Spanish message indicating the module is not configured

---

### REQ-03 — Permission gate

Both Server Actions MUST verify the calling user holds `create` permission for the given `moduleKey`. An unauthenticated request MUST be rejected with `UNAUTHORIZED`. An authenticated user without the required permission MUST be rejected with `FORBIDDEN`.

#### Scenario: VIEWER user attempts preview

- GIVEN a user with VIEWER role
- WHEN the user calls preview for the `categories` module
- THEN the action returns `FORBIDDEN`

#### Scenario: Unauthenticated request

- GIVEN no active session
- WHEN any import Server Action is called
- THEN the action returns `UNAUTHORIZED`

---

### REQ-04 — Row validation

Each row MUST be validated against the column definitions declared in the module config. Validation MUST cover: required fields, data types (string, number, email, date, boolean), maximum length, and enum membership. Validation errors MUST be reported per row, including the field name and a Spanish error message. A row with multiple validation errors MUST report ALL errors — validation MUST NOT short-circuit at the first error per row.

#### Scenario: Type error on a number column

- GIVEN a file where a row has a non-numeric value in the `Vida útil años` column
- WHEN the file is submitted for preview
- THEN that row appears in the errors list with field `defaultUsefulLife` and a Spanish message
- AND the `errorFileBase64` field is present in the response

#### Scenario: Multiple errors on a single row

- GIVEN a row missing a required field AND containing an invalid enum value
- WHEN the file is submitted for preview
- THEN the errors list for that row contains BOTH the missing-required error and the invalid-enum error

---

### REQ-05 — Master validations

The module config MAY declare asynchronous master-data lookups. A row whose referenced master-key value is not found in the master dataset MUST produce a row-level error with the configured Spanish message. Master validations MUST run after column-type validation; a row that already has type errors MAY skip master validation.

#### Scenario: Parent category not found

- GIVEN a row where `Categoría padre` contains a name that does not exist in the database
- WHEN the file is submitted for preview
- THEN that row appears in the errors list with the message "Categoría padre no existe"

#### Scenario: Parent category found

- GIVEN a row where `Categoría padre` contains the exact name of an existing category
- WHEN the file is submitted for preview
- THEN that row is marked valid and the resolved `parentId` is carried into confirm

---

### REQ-06 — Row transformer

The module config MAY declare a pure transformer function. When present, the transformer MUST be applied to each valid row after validation and before the row is passed to the bulk-create handler. The transformer MUST NOT have side effects.

#### Scenario: Transformer maps flat row to handler shape

- GIVEN a module config with a transformer that maps `parentName` to `parentId`
- WHEN the confirm action invokes the bulk-create handler
- THEN each row received by the handler has `parentId` (resolved UUID) and no `parentName` field

---

### REQ-07 — Error file

When preview or confirm returns rows with errors, the response MUST include a base64-encoded `.xlsx` file. This file MUST contain all original rows plus an appended "Errores" column that lists the Spanish error messages for each row. Rows without errors MUST have an empty value in the "Errores" column. When there are zero errors, the error file MUST NOT be present in the response.

#### Scenario: Error file present when errors exist

- GIVEN a preview response where 3 of 10 rows have errors
- THEN the response includes a `errorFileBase64` field that decodes to a valid `.xlsx`
- AND the "Errores" column in that file contains messages for the 3 failing rows only

#### Scenario: No error file when all rows are valid

- GIVEN a preview response where all rows pass validation
- THEN the response does NOT include `errorFileBase64`

---

### REQ-08 — Audit log

Every confirm execution MUST write exactly one `ImportLog` row. The log MUST record: the authenticated user ID, the entity name, the original file name, total rows received, successful rows, failed rows, the errors array as JSON, and a status of `COMPLETED` if at least one row succeeded or `FAILED` if zero rows succeeded.

#### Scenario: Confirm with full success

- GIVEN 100 valid category rows submitted for confirm
- WHEN all 100 rows are inserted without errors
- THEN one `ImportLog` row exists with `status: COMPLETED`, `successRows: 100`, `errorRows: 0`

#### Scenario: Confirm with partial failure

- GIVEN 100 rows submitted for confirm where 5 fail with a duplicate-prefix constraint
- WHEN confirm completes
- THEN `ImportLog` is written with `status: COMPLETED`, `successRows: 95`, `errorRows: 5`
- AND the 5 failed rows appear in the log's `errors` JSON

#### Scenario: Confirm with full failure

- GIVEN 10 rows all of which fail during bulk-create (e.g. DB constraint on every row)
- WHEN confirm completes
- THEN `ImportLog` is written with `status: FAILED`, `successRows: 0`, `errorRows: 10`

---

### REQ-09 — File constraints

The system MUST enforce the following constraints before parsing: file extension MUST be `.xlsx`; file size MUST NOT exceed 10 MB; the workbook MUST contain a sheet named exactly as declared in the module config; row count MUST NOT exceed `config.maxRows` (default 5000). Any violation MUST return a `VALIDATION` error with a Spanish message before any parsing or DB access occurs.

#### Scenario: File too large

- GIVEN a `.xlsx` file exceeding 10 MB
- WHEN the file is submitted for preview
- THEN the action returns a `VALIDATION` error with a Spanish message before parsing begins
- AND no rows are processed

#### Scenario: Wrong sheet name

- GIVEN a workbook that does not contain a sheet named as declared in the module config
- WHEN the file is submitted for preview
- THEN the action returns a `VALIDATION` error in Spanish indicating the expected sheet name

#### Scenario: File exceeds maxRows

- GIVEN a categories import file with 5001 rows (config.maxRows = 5000)
- WHEN the file is submitted for preview
- THEN the action returns a `VALIDATION` error with a Spanish message before processing any rows

---

### REQ-10 — Categories import columns

The categories import MUST accept exactly five columns: `Nombre` (string, required, max 100), `Prefijo` (string, required, max 10), `Descripción` (string, optional, max 500), `Categoría padre` (string, optional), `Vida útil años` (number, optional). `fieldConfig` MUST NOT be a column in the import template.

#### Scenario: Valid five-column categories file

- GIVEN a `.xlsx` with the five declared columns and 20 valid rows
- WHEN submitted for preview
- THEN all 20 rows are valid
- AND the preview response shows `validRows: 20`, `errorCount: 0`

#### Scenario: fieldConfig not imported

- GIVEN a file that includes an extra `fieldConfig` column
- WHEN submitted for preview
- THEN the extra column is silently ignored
- AND rows are validated against the declared five columns only

---

### REQ-11 — Parent category resolution

When `Categoría padre` is provided and matches an existing category name, the row MUST create the category with `parentId` set to that category's ID. When `Categoría padre` is provided and does not match any existing category, the row MUST fail with the error "Categoría padre no existe" — no partial resolution is permitted. When `Categoría padre` is empty or absent, the row MUST create a root category with `parentId: null`.

#### Scenario: Valid parent name — creates child

- GIVEN a row where `Categoría padre` is "Computadores" and that category exists
- WHEN confirm is executed
- THEN the new category is created with `parentId` equal to the "Computadores" category's ID

#### Scenario: Non-existent parent name — row error

- GIVEN a row where `Categoría padre` is "Inexistente" and no such category exists in DB
- WHEN submitted for preview
- THEN that row fails with error "Categoría padre no existe"
- AND the row is excluded from confirm

#### Scenario: Empty parent — root category

- GIVEN a row where `Categoría padre` is empty
- WHEN confirm is executed
- THEN the new category is created with `parentId: null`

---

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

---

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

## Customers

### Categories Import (v1.0)

First consumer of the v2 system. Lands concurrently with the generic infrastructure. Wired into `CategoriesTablePage` with a toolbar import button.

### Employees Import (v2.0)

Second consumer, migrated from v1 in the `migrate-employees-import` change. Wired into `EmployeesTablePage`. Introduces 3 FK validations (department, city, location), each with exact-match requirement and dedicated Spanish error messages. Supports email uniqueness constraint with P2002 handling.

### Assets Import (deferred)

Future consumer to be migrated in a separate change (`migrate-assets-import`). Currently remains on v1 dialog.
