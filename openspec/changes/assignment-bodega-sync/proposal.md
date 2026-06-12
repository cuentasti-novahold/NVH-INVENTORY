# Proposal: Assignment ↔ Bodega Stock Synchronization

## Intent

`createAssignmentAction` creates `Assignment(ACTIVE)` but never updates `Asset.bodegaId` nor records an `AssetMovement`. An asset handed to an employee still shows as physically present in its bodega. This breaks ERP stock traceability and blocks any future billing/invoicing module that needs a documentary anchor for the start of use.

## Scope

### In Scope
- Add `ASSIGNMENT_DELIVERY` and `ASSIGNMENT_RETURN` to the `MovementType` enum.
- Add `previousBodegaId String?` to the `Assignment` model.
- New shared helper `createMovementInTx(tx, dto)` (transaction-client aware).
- Sync `Asset.bodegaId` + emit `AssetMovement` in `createAssignmentAction` (delivery) and `returnAssignmentAction` (return).
- Refactor `movimientos/actions.ts` to use the shared helper (DRY).
- Update affected DTOs.

### Out of Scope
- New UI module, screens, or columns (none required).
- `transferAssignmentAction` bodega logic — asset stays with a person, not a warehouse.
- Analytics "disponibles" KPI — already correct (counts active assignments, not bodegaId).
- The billing/invoicing module itself (future work).

## Capabilities

### New Capabilities
None — this is a behavioral/integrity change to existing assignment and movement flows.

### Modified Capabilities
- `asset-assignment`: assignment lifecycle now mutates physical location and records movements.
- `asset-movement`: two new movement types and a shared transactional creation path.

## Approach

Make assignment lifecycle the single source of truth for physical location. On delivery, snapshot the asset's bodega into `Assignment.previousBodegaId`, clear `Asset.bodegaId`, and emit an `ASSIGNMENT_DELIVERY` movement — all inside the action's existing `$transaction`. On return, restore `bodegaId` from the snapshot and emit `ASSIGNMENT_RETURN`.

### ERP Flow

| Event | Asset.bodegaId | MovementType | Assignment |
|-------|----------------|--------------|------------|
| Assigned to employee | `= null` | `ASSIGNMENT_DELIVERY` | `ACTIVE` created |
| Returned | `= previousBodegaId` | `ASSIGNMENT_RETURN` | `RETURNED` |
| Transferred A→B | `= null` (stays with person) | none | `TRANSFERRED` + new `ACTIVE` |

### Key Decision — nested transaction problem
Prisma 7 does not support nested interactive transactions, so `createMovementAction` (which opens its own `$transaction`) cannot be called from inside the assignment `$transaction`. Solution: extract the movement+asset-update logic into `createMovementInTx(tx, dto)` that accepts a transaction client. Both `movimientos/actions.ts` and the assignment actions reuse it, keeping a single atomic boundary per operation.

### Schema Changes
- `MovementType` enum: `+ ASSIGNMENT_DELIVERY`, `+ ASSIGNMENT_RETURN`.
- `Assignment`: `+ previousBodegaId String?` (nullable — backward-compatible additive migration).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Enum values + `Assignment.previousBodegaId` |
| `src/lib/inventory/movement.helpers.ts` | New | `createMovementInTx(tx, dto)` shared helper |
| `src/app/(dashboard)/assignments/actions.ts` | Modified | `create` + `return` sync bodega and emit movement |
| `src/app/(dashboard)/movimientos/actions.ts` | Modified | Refactor inline logic to use helper |
| `src/app/(dashboard)/assignments/presentation/dto/assignment.dto.ts` | Modified | Add `previousBodegaId` |
| `src/app/(dashboard)/movimientos/presentation/dto/movement.dto.ts` | Modified | Add new `MovementType` values |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bodega lost on return if snapshot missing | Low | Restore is null-safe; legacy assignments have no snapshot, return is a no-op for bodega |
| Helper changes movement atomicity | Low | Helper preserves single `$transaction` per op; covered by tests |
| Migration breaks existing rows | Low | Nullable additive column; no backfill required |

## Rollback Plan

Revert the code commit; the migration adds only a nullable column and two unused enum values — both safe to leave in place. No data backfill to undo. If needed, a follow-up migration drops `previousBodegaId` and the enum values.

## Dependencies

- Prisma migration applied (`prisma migrate dev`).

## Billing/Invoicing Future Relevance

The `AssetMovement(ASSIGNMENT_DELIVERY)` row — with `movedAt`, `fromBodegaId`, and `movedById` — becomes the documentary anchor for billing: the period-of-use calculation starts at the `movedAt` of the delivery movement.

## Success Criteria

- [ ] Assigning an asset sets `Asset.bodegaId = null` and stores the prior value in `Assignment.previousBodegaId`.
- [ ] Assigning emits exactly one `AssetMovement` with `movementType = ASSIGNMENT_DELIVERY` inside the same transaction.
- [ ] Returning an asset restores `Asset.bodegaId` from `previousBodegaId` and emits an `ASSIGNMENT_RETURN` movement.
- [ ] Transferring an asset leaves `Asset.bodegaId = null` and emits no bodega movement.
- [ ] `movimientos/actions.ts` and assignment actions share `createMovementInTx`; no duplicated movement-creation logic remains.
- [ ] Analytics "disponibles" KPI returns the same values as before this change (no regression).
- [ ] No new UI route or component is introduced.
