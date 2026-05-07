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

The v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` and all its current consumers (`EmployeesTablePage`, `AssetsTablePage`) MUST remain unchanged and fully functional after this change is applied. The v2 dialog MUST be deployed at a different import path with no shared code mutation between v1 and v2.

#### Scenario: v1 employee import still works

- GIVEN the `EmployeesTablePage` with its existing v1 import dialog
- WHEN a user triggers the employee import flow
- THEN the v1 dialog renders and the import executes identically to before this change
- AND no code in `src/shared/ui/components/ExcelImportDialog.tsx` has been modified

#### Scenario: v2 categories import is independent

- GIVEN the new `CategoriesTablePage` import button using the v2 dialog
- WHEN a user triggers the categories import flow
- THEN the v2 dialog at `src/shared/excel-import/components/ExcelImportDialog.tsx` is rendered
- AND the v1 dialog is not involved in the flow

---

## Customers

### Categories Import (v1.0)

First consumer of the v2 system. Lands concurrently with the generic infrastructure. Wired into `CategoriesTablePage` with a toolbar import button. Future modules (employees, assets) will be migrated separately.
