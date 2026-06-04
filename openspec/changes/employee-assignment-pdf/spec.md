# Employee Assignment PDF Specification

## Purpose

On-demand generation of a per-employee PDF "Acta de Asignación de Equipos" listing all
ACTIVE assigned assets with a signature block. Provides a printable, sign-able legal
accountability document. This is a new, read-only capability — no schema changes.

---

## Requirements

### REQ-01: Download Button Visibility

The system MUST render an "Acta" download button in the `EmployeesTablePage` inline
actions column for every employee row. The button MUST be disabled (and SHOULD be
visually dimmed) when the employee's `assignmentsCount` equals 0. The button MUST NOT
be rendered at all when the authenticated user does not have `employees:read` permission
(i.e., role below VIEWER).

#### Scenario: button shown and enabled for employee with assignments

- GIVEN the authenticated user has VIEWER role or higher
- AND the employee row has `assignmentsCount >= 1`
- WHEN the employees table renders
- THEN the Acta download button MUST be visible and enabled

#### Scenario: button shown but disabled for employee with no assignments

- GIVEN the authenticated user has VIEWER role or higher
- AND the employee row has `assignmentsCount === 0`
- WHEN the employees table renders
- THEN the Acta download button MUST be visible but disabled (non-interactive)

#### Scenario: button hidden for unauthenticated or unauthorized user

- GIVEN the user does not have `employees:read` permission
- WHEN the employees table renders
- THEN the Acta download button MUST NOT appear in the row actions

---

### REQ-02: Permission Gate

The server action `getEmployeeAssignmentReportAction(employeeId)` MUST verify that the
caller has at minimum VIEWER role with `employees:read` permission before returning any
data. Any role VIEWER or higher MUST be allowed to trigger the download.

#### Scenario: VIEWER downloads acta

- GIVEN the user has VIEWER role
- AND the target employee has at least one ACTIVE assignment
- WHEN the download button is clicked
- THEN the server action MUST return employee data and assignment list without error

#### Scenario: unauthenticated caller blocked

- GIVEN there is no valid session
- WHEN `getEmployeeAssignmentReportAction` is called directly
- THEN the action MUST return an UNAUTHORIZED error and no data SHALL be returned

---

### REQ-03: Empty Assignments Guard

The system MUST prevent PDF generation when the employee has zero ACTIVE assignments.
The download button MUST be disabled client-side (REQ-01). If the server action is
called despite the guard (e.g., direct API call), it MUST return an empty assignments
array; the client MUST treat this as an error and display a toast notification in Spanish.

#### Scenario: client-side block prevents call

- GIVEN `assignmentsCount === 0` for a given employee row
- WHEN the user attempts to click the Acta button
- THEN the click MUST be inert (no action triggered, no server call made)

#### Scenario: server returns empty list — client shows toast

- GIVEN the server action returns an assignments array of length 0
- WHEN the download component receives this response
- THEN it MUST NOT generate a PDF
- AND it MUST display an error toast in Spanish (e.g., "Este empleado no tiene asignaciones activas")

---

### REQ-04: Server Action Data Contract

`getEmployeeAssignmentReportAction(employeeId: string)` MUST return:

| Field path | Type | Description |
|---|---|---|
| `employee.id` | string | Employee UUID |
| `employee.name` | string | Full name |
| `employee.position` | string | Job title / position |
| `employee.department` | string | Department name |
| `employee.documentId` | string | National ID or employee ID |
| `assignments[].asset.code` | string | Asset code (NVH-XXX-NNNNN) |
| `assignments[].asset.name` | string | Asset name |
| `assignments[].asset.serialNumber` | string \| null | Serial number |
| `assignments[].asset.condition` | enum | GOOD \| REGULAR \| BAD \| DAMAGED \| RETIRED |
| `assignments[].asset.category.name` | string | Category name |
| `assignments[].assignedAt` | Date | Assignment date |
| `assignments[].deliveredBy.name` | string | Deliverer full name |

Only assignments with `status === 'ACTIVE'` MUST be included.

#### Scenario: action returns complete employee + assignments data

- GIVEN a valid `employeeId` with 2 ACTIVE assignments
- WHEN `getEmployeeAssignmentReportAction` is called by a VIEWER+
- THEN the response MUST include all fields listed above for the employee
- AND MUST include exactly 2 assignment entries, each with asset, category, and deliveredBy

#### Scenario: non-existent employeeId

- GIVEN an `employeeId` that does not exist in the database
- WHEN the action is called
- THEN it MUST return a NOT_FOUND error; no partial data SHALL be returned

---

### REQ-05: PDF Content Structure

The generated PDF MUST follow the layout order below. All user-facing strings MUST be
in Spanish.

| Section | Required fields |
|---|---|
| Header | Company logo or name, title "ACTA DE ASIGNACIÓN DE EQUIPOS", generation date |
| Employee block | Nombre, Cargo, Departamento, Documento de Identidad |
| Asset table | See REQ-06 |
| Declaration | Fixed legal accountability paragraph in Spanish |
| Signature block | See REQ-07 |

#### Scenario: PDF renders all required sections

- GIVEN a valid employee with 1+ ACTIVE assignments
- WHEN the PDF blob is generated
- THEN the output MUST contain header, employee block, asset table, declaration, and signature block sections

---

### REQ-06: PDF Asset Table

The asset table MUST contain the following columns in this order:

| # | Column header (Spanish) | Source field |
|---|---|---|
| 1 | Código | `asset.code` |
| 2 | Nombre | `asset.name` |
| 3 | Categoría | `asset.category.name` |
| 4 | N° Serie | `asset.serialNumber` (empty string if null) |
| 5 | Estado | Mapped label (see REQ-08) |
| 6 | Fecha Entrega | `assignedAt` formatted as DD/MM/YYYY |
| 7 | Entregado por | `deliveredBy.name` |

Rows MUST be ordered by `assignedAt` ascending (oldest first).

#### Scenario: table columns and order are correct

- GIVEN 3 ACTIVE assignments with different `assignedAt` dates
- WHEN the PDF is generated
- THEN the asset table MUST contain 7 columns in the specified order
- AND rows MUST appear oldest `assignedAt` first

#### Scenario: null serialNumber renders as empty cell

- GIVEN an assignment where `asset.serialNumber` is null
- WHEN the PDF is generated
- THEN the "N° Serie" cell for that row MUST render as an empty string, not "null" or "undefined"

---

### REQ-07: PDF Signature Block

The signature block MUST contain two empty signature lines, one for the employee and
one for the deliverer/responsible. Each line MUST include: a horizontal rule (underscore
line), a label beneath it, and a space for the date.

| Line | Label |
|---|---|
| 1 | "Firma del Empleado / Nombre: \_\_\_\_\_\_ / Fecha: \_\_\_\_\_\_" |
| 2 | "Firma del Responsable / Nombre: \_\_\_\_\_\_ / Fecha: \_\_\_\_\_\_" |

#### Scenario: signature block renders two labeled lines

- GIVEN a successfully generated PDF
- WHEN the signature section is inspected
- THEN exactly two signature lines MUST be present, each with a label matching the table above

---

### REQ-08: Asset Status Labels (Spanish)

The `asset.condition` enum value MUST be mapped to a Spanish display label in the PDF.
No raw enum value SHALL appear in the printed document.

| Enum value | Spanish label |
|---|---|
| GOOD | Bueno |
| REGULAR | Regular |
| BAD | Malo |
| DAMAGED | Dañado |
| RETIRED | Dado de baja |

#### Scenario: all enum values map to Spanish

- GIVEN a PDF with assets in each of the 5 condition states
- WHEN the asset table is rendered
- THEN each row MUST display the corresponding Spanish label, not the raw enum string

---

### REQ-09: File Naming

The downloaded file MUST be named using the pattern:
`acta-asignacion-{employeeId[:8]}.pdf`
where `{employeeId[:8]}` is the first 8 characters of the employee UUID.

#### Scenario: downloaded filename matches pattern

- GIVEN employee UUID `"a1b2c3d4-e5f6-..."`
- WHEN the PDF is downloaded
- THEN the browser filename MUST be `acta-asignacion-a1b2c3d.pdf`

---

### REQ-10: Error Handling

If `getEmployeeAssignmentReportAction` returns an error (network, server, or auth), the
download component MUST display a Sonner toast with an error message in Spanish.
The PDF download MUST NOT be initiated. No unhandled promise rejection SHALL propagate.

#### Scenario: server action fails — toast shown

- GIVEN the server action throws or returns an error
- WHEN the user clicks the Acta button
- THEN a Sonner toast with an error message in Spanish MUST be displayed
- AND no PDF file download MUST be triggered

#### Scenario: action succeeds — no error toast

- GIVEN the server action returns valid data
- WHEN the PDF is generated and the download completes
- THEN no error toast SHALL be shown
