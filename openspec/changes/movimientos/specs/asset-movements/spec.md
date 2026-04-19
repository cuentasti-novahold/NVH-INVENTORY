# Asset Movements Specification

## Purpose

Track every physical movement of an asset between Locations (sedes) and Bodegas (warehouses). Provides a queryable Kardex — ordered history of where each asset has been, who moved it, and why.

## Requirements

### Requirement: REQ-01 List Movements

The system MUST display asset movements in a paginated, server-rendered table at `/movimientos`. Default view MUST show all movement types ordered by `movedAt` descending.

#### Scenario: List all movements

- GIVEN an authenticated user with `movements:read` permission
- WHEN they visit `/movimientos`
- THEN a paginated table appears with columns: Activo, Desde, Hacia, Tipo, Registrado por, Fecha

#### Scenario: Filter by movement type

- GIVEN a user viewing `/movimientos`
- WHEN they click a type tab (e.g., REPAIR)
- THEN only movements of that type are shown and pagination resets to page 1

#### Scenario: Unauthorized access

- GIVEN a request with no valid session
- WHEN `/movimientos` is accessed
- THEN the system redirects to `/`

---

### Requirement: REQ-02 Create Movement

The system MUST atomically create an `AssetMovement` record and update `Asset.locationId` / `Asset.bodegaId` to the destination values in a single database transaction.

#### Scenario: Successful movement registration

- GIVEN a user with `movements:create` permission
- WHEN they submit a valid movement form (assetId, toLocationId, movementType)
- THEN an AssetMovement record is created
- AND Asset.locationId and Asset.bodegaId are updated to the new values
- AND an AuditLog entry with action='MOVED' is created

#### Scenario: Missing required field

- GIVEN a user submitting the movement form
- WHEN `toLocationId` or `movementType` is empty
- THEN the system returns a VALIDATION error with field-level messages
- AND no database changes are made

#### Scenario: Insufficient permission

- GIVEN a user with `movements:read` only (VIEWER)
- WHEN they attempt to submit a movement
- THEN the system returns FORBIDDEN
- AND no database changes are made

---

### Requirement: REQ-03 Delete Movement

The system MUST allow users with `movements:delete` permission to hard-delete an AssetMovement record. The system MUST NOT reverse the asset's current location when a movement is deleted.

#### Scenario: Successful deletion

- GIVEN a user with `movements:delete` permission
- WHEN they delete a movement record
- THEN the AssetMovement row is removed
- AND Asset.locationId remains unchanged

#### Scenario: Delete non-existent movement

- GIVEN a user with `movements:delete` permission
- WHEN they attempt to delete a movement that does not exist
- THEN the system returns NOT_FOUND

#### Scenario: Delete without permission

- GIVEN a MANAGER user (has `movements:create` but not `movements:delete`)
- WHEN they attempt to delete a movement
- THEN the system returns FORBIDDEN

---

### Requirement: REQ-04 Kardex View

The system MUST provide a filtered view of all movements for a single asset via `?assetId={id}`, displaying a visual indicator that the list is in Kardex mode.

#### Scenario: Kardex for specific asset

- GIVEN a user with `movements:read` permission
- WHEN they visit `/movimientos?assetId={id}`
- THEN only movements for that asset are shown, ordered by movedAt descending
- AND a Kardex banner is visible identifying the asset

#### Scenario: Kardex with no movements

- GIVEN an asset with zero movement records
- WHEN Kardex view is requested for that asset
- THEN an empty state message is shown (no error)

---

### Requirement: REQ-05 Permission Model

The system MUST enforce role-based access for all movement operations.

| Role | read | create | delete |
|------|------|--------|--------|
| SUPER_ADMIN | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ❌ |
| TECHNICIAN | ✅ | ✅ | ❌ |
| VIEWER | ✅ | ❌ | ❌ |

#### Scenario: UI reflects permissions

- GIVEN a VIEWER user viewing `/movimientos`
- WHEN the page renders
- THEN the "Registrar traslado" button is NOT visible
- AND no delete action buttons appear in the table
