# Delta Spec: assignment-bodega-sync

Change name: `assignment-bodega-sync`
Affected capabilities: `asset-assignment` (MODIFIED), `asset-movement` (MODIFIED — new helper + enum values)

---

## Requirements

| # | Strength | Statement |
|---|----------|-----------|
| REQ-S-01 | MUST | `createAssignmentAction` MUST read `Asset.bodegaId` before mutating any row. |
| REQ-S-02 | MUST | `createAssignmentAction` MUST persist the read `bodegaId` value (including `null`) into `Assignment.previousBodegaId`. |
| REQ-S-03 | MUST | `createAssignmentAction` MUST set `Asset.bodegaId = null` for the assigned asset. |
| REQ-S-04 | MUST | `createAssignmentAction` MUST emit exactly one `AssetMovement` of type `ASSIGNMENT_DELIVERY` within the same `$transaction`. |
| REQ-S-05 | MUST | `returnAssignmentAction` MUST restore `Asset.bodegaId` to the value stored in `Assignment.previousBodegaId`. If `previousBodegaId` is `null`, `Asset.bodegaId` MUST remain `null` (null-safe no-op). |
| REQ-S-06 | MUST | `returnAssignmentAction` MUST emit exactly one `AssetMovement` of type `ASSIGNMENT_RETURN` within the same `$transaction`. |
| REQ-S-07 | MUST NOT | `transferAssignmentAction` MUST NOT change `Asset.bodegaId` and MUST NOT emit any `AssetMovement` related to bodega. |
| REQ-S-08 | MUST | `MovementType` enum MUST include `ASSIGNMENT_DELIVERY` and `ASSIGNMENT_RETURN` as valid values. |
| REQ-S-09 | MUST | A shared helper `createMovementInTx(tx, dto)` MUST accept a Prisma transaction client and encapsulate movement + asset-update persistence. Both assignment actions and `movimientos/actions.ts` MUST use this helper — no duplicated movement-creation logic allowed. |
| REQ-S-10 | MUST NOT | REQ-S-03, REQ-S-04, REQ-S-05, REQ-S-06 MUST NOT execute outside a `$transaction`. Partial state (movement without bodega update, or vice versa) MUST NOT be observable. |
| REQ-S-11 | MUST | The existing conflict guard (reject if asset already has ACTIVE assignment) MUST continue to function unchanged after this change. |
| REQ-S-12 | MUST NOT | The analytics `disponibles` KPI MUST NOT regress. "Disponibles" counts assets without an ACTIVE assignment — `Asset.bodegaId` changes MUST NOT affect this count. |
| REQ-S-13 | MUST | `ASSIGNMENT_DELIVERY` movements MUST appear in the `/movimientos` paginated list. |
| REQ-S-14 | MUST | `Assignment.previousBodegaId` MUST be a nullable `String?`. Existing rows without this column MUST be treated as `null` (backward-compatible additive migration). |

---

## Acceptance Scenarios

### Scenario 1 — Happy path: assign asset that has a bodegaId

- GIVEN an asset with `bodegaId = "bodega-A"` and no ACTIVE assignment
- WHEN `createAssignmentAction` is called with valid `assetId` and `employeeId`
- THEN `Asset.bodegaId` MUST equal `null`
- AND `Assignment.previousBodegaId` MUST equal `"bodega-A"`
- AND exactly one `AssetMovement` with `movementType = ASSIGNMENT_DELIVERY` MUST exist for that asset
- AND all three mutations MUST share the same database transaction

### Scenario 2 — Happy path: assign asset that has bodegaId = null

- GIVEN an asset with `bodegaId = null` and no ACTIVE assignment
- WHEN `createAssignmentAction` is called
- THEN `Asset.bodegaId` MUST remain `null`
- AND `Assignment.previousBodegaId` MUST equal `null`
- AND exactly one `AssetMovement` of type `ASSIGNMENT_DELIVERY` MUST be emitted

### Scenario 3 — Happy path: return an assignment that has previousBodegaId

- GIVEN an ACTIVE assignment with `previousBodegaId = "bodega-A"` and `Asset.bodegaId = null`
- WHEN `returnAssignmentAction` is called
- THEN `Asset.bodegaId` MUST equal `"bodega-A"`
- AND `Assignment.status` MUST equal `RETURNED`
- AND exactly one `AssetMovement` of type `ASSIGNMENT_RETURN` MUST exist for that asset

### Scenario 4 — Happy path: return legacy assignment with null previousBodegaId

- GIVEN an ACTIVE assignment with `previousBodegaId = null` (created before this change)
- WHEN `returnAssignmentAction` is called
- THEN `Asset.bodegaId` MUST remain `null`
- AND `Assignment.status` MUST equal `RETURNED`
- AND exactly one `AssetMovement` of type `ASSIGNMENT_RETURN` MUST be emitted
- AND no error MUST be thrown

### Scenario 5 — Happy path: transfer — bodegaId unchanged

- GIVEN an ACTIVE assignment for employee A, `Asset.bodegaId = null`
- WHEN `transferAssignmentAction` is called to transfer to employee B
- THEN `Asset.bodegaId` MUST remain `null`
- AND no `AssetMovement` of type `ASSIGNMENT_DELIVERY` or `ASSIGNMENT_RETURN` MUST be created
- AND the old assignment MUST have status `TRANSFERRED`
- AND a new ACTIVE assignment for employee B MUST exist

### Scenario 6 — Error case: assign asset already ACTIVE (conflict guard regression)

- GIVEN asset has an existing ACTIVE assignment
- WHEN `createAssignmentAction` is called for the same asset
- THEN the action MUST reject with a CONFLICT error
- AND `Asset.bodegaId` MUST NOT be mutated
- AND no `AssetMovement` MUST be emitted

### Scenario 7 — Movement visibility: ASSIGNMENT_DELIVERY in /movimientos

- GIVEN an assignment was created for an asset with `bodegaId = "bodega-B"`
- WHEN a user navigates to `/movimientos`
- THEN the resulting `ASSIGNMENT_DELIVERY` movement MUST appear in the paginated list with correct `movementType`, `movedAt`, and `assetId`

### Scenario 8 — Analytics: "disponibles" KPI unchanged

- GIVEN N assets exist with no ACTIVE assignment before and after an assignment is created and returned
- WHEN the analytics dashboard computes "activos disponibles"
- THEN the count MUST equal the number of assets without an ACTIVE assignment, regardless of `Asset.bodegaId` value

---

## Data Invariants

After every `createAssignmentAction` call:
- `Assignment.status = ACTIVE`
- `Asset.bodegaId = null`
- `Assignment.previousBodegaId` = value of `Asset.bodegaId` before the action
- Exactly one `AssetMovement` row with `movementType = ASSIGNMENT_DELIVERY` exists for that `assetId` and that transaction's timestamp

After every `returnAssignmentAction` call:
- `Assignment.status = RETURNED`
- `Asset.bodegaId = Assignment.previousBodegaId` (null if legacy)
- Exactly one `AssetMovement` row with `movementType = ASSIGNMENT_RETURN` exists for that `assetId`

After every `transferAssignmentAction` call:
- Old `Assignment.status = TRANSFERRED`
- New `Assignment.status = ACTIVE`
- `Asset.bodegaId` is unchanged from before the transfer
- No `ASSIGNMENT_DELIVERY` or `ASSIGNMENT_RETURN` movement is created

At all times:
- No asset has more than one ACTIVE assignment (pre-existing invariant, unchanged)
- Movement records are immutable once written (no update or delete on `AssetMovement`)

---

## Non-Requirements (explicitly out of scope)

- No new UI module, route, page, column, or dialog.
- No change to `transferAssignmentAction` bodega logic.
- No backfill migration for existing Assignment rows (legacy `previousBodegaId = null` is acceptable).
- No change to the analytics "disponibles" computation logic.
- No billing/invoicing module implementation.
- No change to RBAC rules for assignment actions.
- No new audit log entries beyond the existing `AssetMovement` record.
