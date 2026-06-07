# Delta Spec — erp-business-rules

**Change**: `erp-business-rules`
**Project**: nvh-inventory
**Status**: spec
**Date**: 2026-06-07
**Artifact store**: hybrid (engram + openspec)

---

## Domain Coverage

| Domain | Type | Issues |
|--------|------|--------|
| Asset write paths | New full spec | Issue 1 (location required), Issue 2 (conditional bodega) |
| Movement create | New full spec | Issue 2 (conditional bodega on toLocation) |
| Employee deactivation | New full spec | Issue 3 (active-assignment guard) |

No existing `openspec/specs/` entries for these domains — full specs written below.

---

# Asset Write Path Specification

## Purpose

Governs all server-side validation and persistence rules for creating and editing assets in the ERP. Server actions are the authoritative enforcement layer; form config mirrors rules as UX only.

---

## Requirements

### REQ-01: Asset Location Required on Create

Every asset creation request MUST include a non-empty `locationId`. The server action MUST reject any create request where `locationId` is absent, null, or empty string, returning a `VALIDATION` error before any DB write occurs.

The asset Yup schema MUST enforce `locationId` as `.required('La ubicación es obligatoria')`.

The create DTO MUST declare `locationId: string` (not `string | null`).

The create action MUST NOT apply a `?? null` fallback for `locationId`; a missing value must propagate as a validation failure.

#### Scenario S-01-A: Create asset with valid locationId

- GIVEN a write-permission user submits a create-asset payload with a valid `locationId`
- WHEN `createAssetAction` is called
- THEN the asset is persisted with `locationId` set to the provided value
- AND the action returns `ok(AssetRow)`

#### Scenario S-01-B: Create asset without locationId

- GIVEN a write-permission user submits a create-asset payload with `locationId` absent or null
- WHEN `createAssetAction` is called
- THEN no asset row is written to the database
- AND the action returns `err('VALIDATION', 'Datos inválidos', { locationId: 'La ubicación es obligatoria' })`

#### Scenario S-01-C: Create asset with empty string locationId

- GIVEN a write-permission user submits a create-asset payload with `locationId: ""`
- WHEN `createAssetAction` is called
- THEN no asset row is written to the database
- AND the action returns `err('VALIDATION', ...)` keyed to `locationId`

#### Scenario S-01-D: Edit asset — location field remains required (no clearing to null)

- GIVEN an existing asset is edited and the payload omits or nulls `locationId`
- WHEN `updateAssetAction` is called
- THEN the action MUST NOT set `locationId` to null on the existing record
- AND if `locationId` is explicitly provided as null, return `err('VALIDATION', ...)` keyed to `locationId`

#### Scenario S-01-E: Existing asset with null location becomes form-flagged on edit

- GIVEN an asset in the database currently has `locationId = null`
- WHEN the edit form is opened
- THEN the location field MUST be flagged as required/missing to the user before submit
- AND the user MUST supply a location before the save can succeed

#### Scenario S-01-F: Form config marks location as required

- GIVEN the asset form is rendered
- WHEN the form config is evaluated
- THEN the location field MUST have `required: true`
- AND the field MUST visually indicate it is mandatory

---

### REQ-02: Conditional Bodega Required on Asset Write

When the target `locationId` refers to a Location that has one or more Bodegas, the asset write request MUST include a non-null, non-empty `bodegaId`. When the Location has zero Bodegas, `bodegaId` remains optional and MUST NOT be required.

This rule MUST be evaluated server-side via a live count query (`locationHasBodegas`) on every create and edit operation. It MUST run before persistence.

The asset form MUST dynamically mark the bodega field as required when the selected location returns ≥1 bodega from `searchBodegasByLocationAction`, and optional/hidden when it returns 0.

#### Scenario S-02-A: Create asset — location with bodegas, bodegaId provided

- GIVEN a location exists with ≥1 bodega
- AND the create payload supplies a valid `bodegaId` that belongs to that location
- WHEN `createAssetAction` is called
- THEN the asset is persisted with both `locationId` and `bodegaId` set
- AND the action returns `ok(AssetRow)`

#### Scenario S-02-B: Create asset — location with bodegas, bodegaId absent

- GIVEN a location exists with ≥1 bodega
- AND the create payload has `bodegaId` absent or null
- WHEN `createAssetAction` is called
- THEN no asset row is written
- AND the action returns `err('VALIDATION', 'Datos inválidos', { bodegaId: 'La bodega es obligatoria para esta ubicación' })`

#### Scenario S-02-C: Create asset — location with zero bodegas, no bodegaId

- GIVEN a location exists with 0 bodegas
- AND the create payload has `bodegaId` absent or null
- WHEN `createAssetAction` is called
- THEN the asset is persisted without a bodega (bodegaId null)
- AND the action returns `ok(AssetRow)`

#### Scenario S-02-D: Edit asset — location changed to one with bodegas, bodegaId absent

- GIVEN an edit payload changes `locationId` to a location that has ≥1 bodega
- AND `bodegaId` is absent or null in the payload
- WHEN `updateAssetAction` is called
- THEN no update is written
- AND the action returns `err('VALIDATION', ...)` keyed to `bodegaId`

#### Scenario S-02-E: Edit asset — location has bodegas, bodegaId provided

- GIVEN the updated location has ≥1 bodega
- AND the edit payload includes a valid `bodegaId`
- WHEN `updateAssetAction` is called
- THEN the asset is updated with both fields
- AND the action returns `ok(AssetRow)`

#### Scenario S-02-F: Form — location with bodegas selected

- GIVEN the asset form is open and the user selects a location that has ≥1 bodega
- WHEN the bodega field is rendered
- THEN the bodega field MUST be marked required
- AND the form MUST NOT allow submit without a bodega value

#### Scenario S-02-G: Form — location with no bodegas selected

- GIVEN the asset form is open and the user selects a location with 0 bodegas
- WHEN the bodega field is rendered
- THEN the bodega field MUST be optional or hidden
- AND submit MUST succeed without a bodega value

---

# Movement Create Specification

## Purpose

Governs server-side validation and persistence rules for creating asset movements (`createMovementAction`). Enforces the conditional bodega rule on the destination location.

---

## Requirements

### REQ-03: Conditional Bodega Required on Movement Destination

When `toLocationId` refers to a Location that has ≥1 Bodega, the create-movement request MUST include a non-null, non-empty `toBodegaId`. When the destination Location has zero Bodegas, `toBodegaId` remains optional.

The bodega count check MUST execute inside the existing `$transaction` to remain consistent under concurrent bodega creation/deletion.

The movement form MUST dynamically require the bodega field on destination location change, mirroring asset form behavior.

#### Scenario S-03-A: Create movement — destination location with bodegas, toBodegaId provided

- GIVEN `toLocationId` refers to a location with ≥1 bodega
- AND the payload includes a valid `toBodegaId`
- WHEN `createMovementAction` is called
- THEN the movement is persisted with `toLocationId` and `toBodegaId` set
- AND the linked asset's `locationId` and `bodegaId` are updated to destination values
- AND the action returns `ok(MovementRow)`

#### Scenario S-03-B: Create movement — destination location with bodegas, toBodegaId absent

- GIVEN `toLocationId` refers to a location with ≥1 bodega
- AND the payload has `toBodegaId` absent or null
- WHEN `createMovementAction` is called
- THEN no movement row is written and the asset is not updated
- AND the action returns `err('VALIDATION', 'Datos inválidos', { toBodegaId: 'La bodega de destino es obligatoria para esta ubicación' })`

#### Scenario S-03-C: Create movement — destination location with zero bodegas

- GIVEN `toLocationId` refers to a location with 0 bodegas
- AND the payload has `toBodegaId` absent or null
- WHEN `createMovementAction` is called
- THEN the movement is persisted with `toBodegaId = null`
- AND the action returns `ok(MovementRow)`

#### Scenario S-03-D: Form — destination location with bodegas selected

- GIVEN the movement form is open and the user selects a destination location with ≥1 bodega
- WHEN the destination bodega field is rendered
- THEN the field MUST be marked required
- AND the form MUST NOT submit without a `toBodegaId`

#### Scenario S-03-E: Form — destination location with no bodegas selected

- GIVEN the movement form is open and the user selects a destination location with 0 bodegas
- WHEN the destination bodega field is rendered
- THEN the field MUST be optional or hidden
- AND submit MUST succeed without `toBodegaId`

---

# Employee Deactivation Specification

## Purpose

Governs the `deactivateEmployeeAction` guard that prevents deactivating an employee who currently holds actively assigned assets.

---

## Requirements

### REQ-04: Block Deactivation When Employee Has Active Assignments

`deactivateEmployeeAction` MUST query the employee's assignments filtered to `status: 'ACTIVE'` BEFORE opening any transaction. If one or more ACTIVE assignments exist, the action MUST return a blocking error and MUST NOT flip `isActive` to false.

The guard MUST be scoped to `status: 'ACTIVE'` only. Assignments with status `RETURNED` or `TRANSFERRED` MUST NOT block deactivation — they do not represent current custody.

This is an intentional asymmetry with `deleteEmployeeAction`, which blocks on ANY assignment count (including historical). The deactivation guard is narrower because historical closed assignments do not constitute ongoing responsibility.

The guard MUST run outside the transaction (consistent with the delete guard pattern at line 384).

#### Scenario S-04-A: Deactivate employee with no active assignments

- GIVEN an employee exists and has zero assignments with `status: 'ACTIVE'`
- WHEN `deactivateEmployeeAction` is called
- THEN `isActive` is set to false and persisted
- AND an audit entry is written
- AND the action returns `ok(undefined)`

#### Scenario S-04-B: Deactivate employee with one or more active assignments

- GIVEN an employee exists and has N ≥1 assignments with `status: 'ACTIVE'`
- WHEN `deactivateEmployeeAction` is called
- THEN no database write occurs (`isActive` is not changed)
- AND the action returns `err('HAS_CHILDREN', 'No se puede desactivar: el empleado tiene N asignación/es activa/s. Reasigná o registrá la devolución de los activos primero.')`

#### Scenario S-04-C: Deactivate employee with only RETURNED assignments

- GIVEN an employee has zero ACTIVE assignments but one or more RETURNED assignments
- WHEN `deactivateEmployeeAction` is called
- THEN `isActive` is set to false and persisted
- AND the action returns `ok(undefined)`

#### Scenario S-04-D: Deactivate employee with only TRANSFERRED assignments

- GIVEN an employee has zero ACTIVE assignments but one or more TRANSFERRED assignments
- WHEN `deactivateEmployeeAction` is called
- THEN `isActive` is set to false and persisted
- AND the action returns `ok(undefined)`

#### Scenario S-04-E: Deactivate non-existent employee

- GIVEN an employee ID that does not exist in the database
- WHEN `deactivateEmployeeAction` is called
- THEN the action returns `err('NOT_FOUND', 'Empleado no encontrado')`

#### Scenario S-04-F: Deactivate employee — guard runs before transaction

- GIVEN an employee with ACTIVE assignments
- WHEN `deactivateEmployeeAction` is called
- THEN the ACTIVE-assignment count query MUST complete before any transaction is opened
- AND the transaction MUST NOT be opened if the count is > 0

---

## Error Code Reference

| Code | HTTP analogy | Usage in this change |
|------|-------------|----------------------|
| `VALIDATION` | 422 | Field-level validation failures (locationId, bodegaId, toBodegaId) |
| `HAS_CHILDREN` | 409 | Deactivation blocked by active assignments |
| `NOT_FOUND` | 404 | Employee not found on deactivate |

---

## Test Scenarios (Strict TDD)

Each scenario maps to a Vitest unit or integration test against the server action or schema validator.

| Test ID | Layer | Scenario |
|---------|-------|----------|
| T-01-B | action | createAssetAction rejects null locationId → VALIDATION |
| T-01-C | schema | Yup schema rejects empty-string locationId |
| T-02-B | action | createAssetAction rejects missing bodegaId when location has bodegas |
| T-02-C | action | createAssetAction accepts null bodegaId when location has zero bodegas |
| T-03-B | action | createMovementAction rejects missing toBodegaId when toLocation has bodegas |
| T-03-C | action | createMovementAction accepts null toBodegaId when toLocation has zero bodegas |
| T-04-A | action | deactivateEmployeeAction succeeds when no ACTIVE assignments |
| T-04-B | action | deactivateEmployeeAction returns HAS_CHILDREN when ACTIVE assignments exist |
| T-04-C | action | deactivateEmployeeAction succeeds when only RETURNED assignments |
| T-04-D | action | deactivateEmployeeAction succeeds when only TRANSFERRED assignments |

Test runner: `pnpm vitest run`

---

## Out-of-Scope Constraints (carried from proposal)

- No DB `NOT NULL` migration on `Asset.locationId` in this change — app-layer enforcement only.
- No backfill of existing null-location or null-bodega asset rows.
- No changes to Assignment lifecycle enum, Location/Bodega hierarchy, or movement types.
- The 16 pre-existing test failures MUST NOT be fixed or regressed in this change.
