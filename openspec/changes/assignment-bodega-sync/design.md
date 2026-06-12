# Design: Assignment ↔ Bodega Stock Synchronization

## Technical Approach

Make the Assignment lifecycle the single source of truth for an asset's physical
presence. Delivery clears `Asset.bodegaId` (snapshotting the prior value on the
Assignment) and emits an `ASSIGNMENT_DELIVERY` movement; return restores the
bodega and emits `ASSIGNMENT_RETURN`. All mutations happen inside the EXISTING
`$transaction` of each action — no second transaction is opened. Movement creation
is factored into a transaction-client-aware helper `createMovementInTx(tx, dto)`
reused by both `movimientos/actions.ts` and the assignment actions, so there is one
atomic boundary per operation and zero duplicated movement logic.

Maps to proposal section "Approach / ERP Flow". No new UI, route, or capability.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|----------|-----------------------|-----------|
| 1 | Extract `createMovementInTx(tx, dto)` accepting a `Prisma.TransactionClient` | Call `createMovementAction` from inside assignment `$transaction` | Prisma 7 forbids nested interactive transactions; passing `tx` keeps one atomic boundary. Mirrors existing `locationHasBodegas(client, ...)` `PrismaOrTx` pattern in `src/lib/location.ts`. |
| 2 | Movement `toLocationId = asset.locationId` (unchanged) on delivery/return | Treat delivery as a location change | An employee handoff does NOT move the asset between Locations, only out of its bodega. `toLocationId` is a required FK, so we reuse the asset's current location. Only `bodegaId` toggles. |
| 3 | Snapshot prior bodega in new `Assignment.previousBodegaId String?` | Recompute from movement history on return | A dedicated nullable column is O(1), survives movement edits, and is the documentary anchor. Legacy rows are `null` → return becomes a null-safe no-op for bodega restore. |
| 4 | Helper does NOT call `auth()`/`writeAudit`; caller owns audit | Move audit into helper | Audit semantics differ per caller (Asset MOVED vs Assignment CREATE/RETURNED). Helper stays a pure DB primitive; callers keep their own audit writes. |
| 5 | Helper accepts `movedById` as an explicit arg | Read session inside helper | Helper must be session-agnostic to run inside any tx; the caller already resolved `g.userId` / `session.user.id`. |

## Data Flow

    createAssignmentAction
      │  validate DTO, requireWrite
      ▼
    prisma.$transaction(tx) ───────────────────────────────┐
      │ 1. conflict guard (findFirst ACTIVE)                │
      │ 2. load asset.locationId + bodegaId                 │
      │ 3. assignment.create(previousBodegaId = bodegaId)   │
      │ 4. createMovementInTx(tx, {ASSIGNMENT_DELIVERY,     │  one atomic
      │       toLocationId = asset.locationId,              │  boundary
      │       fromBodegaId = bodegaId, toBodegaId = null})  │
      │       └─ inside helper: movement.create + asset.update(bodegaId=null)
      │ 5. writeAudit(tx, CREATE)                           │
      ▼ ──────────────────────────────────────────────────┘
    revalidatePath('/assignments' + '/assets' + '/movimientos')

## Schema Changes (`prisma/schema.prisma`)

    enum MovementType {
      RELOCATION
      LOAN
      REPAIR
      RETURN_FROM_REPAIR
      AUDIT
      ASSIGNMENT_DELIVERY   // new
      ASSIGNMENT_RETURN     // new
    }

    model Assignment {
      // ...existing fields...
      previousBodegaId String?   // new, nullable, additive
    }

Migration: `npx prisma migrate dev --name assignment_bodega_sync`. Additive only —
two enum values + one nullable column. No backfill. Backward compatible.

## Helper Design (`src/lib/inventory/movement.helpers.ts` — NEW)

    import type { Prisma } from '@/generated/prisma/client';
    import { writeAudit } from '@/lib/audit'; // NOT used here — caller owns audit

    export interface CreateMovementInput {
      assetId: string;
      fromLocationId?: string | null;
      fromBodegaId?: string | null;
      toLocationId: string;          // required FK
      toBodegaId?: string | null;
      movementType: string;          // MovementType union
      reason?: string | null;
      notes?: string | null;
      movedById: string;
    }

    // Runs inside a caller-provided transaction. Creates the AssetMovement row
    // AND syncs Asset.locationId/bodegaId. Returns the created movement (with
    // movementInclude). Does NOT open its own $transaction and does NOT write audit.
    export async function createMovementInTx(
      tx: Prisma.TransactionClient,
      input: CreateMovementInput,
    ): Promise<...movement with include...>

Internals (lifted verbatim from `createMovementAction`'s tx body, minus auth/audit):
1. `assetMovement.create({ data: {...}, include: movementInclude })`
2. `asset.update({ where:{id}, data:{ locationId: toLocationId, bodegaId: toBodegaId ?? null }})`
3. return the movement.

`movimientos/actions.ts` refactor: `createMovementAction` keeps its own
`prisma.$transaction`, keeps the `locationHasBodegas` guard and `writeAudit`, but
replaces its inline `assetMovement.create` + `asset.update` with a single
`createMovementInTx(tx, {...dto, movedById: session.user.id})` call.

Why `tx` not its own transaction: Prisma 7 disallows nested interactive
transactions (Decision 1). The assignment action already owns the outer
`$transaction`; the helper must enlist in it, not start a new one.

## Modified Action Flows

### createAssignmentAction (inside existing `$transaction`)
1. `tx.assignment.findFirst` ACTIVE conflict guard *(unchanged)*
2. **NEW** `tx.asset.findUnique({ where:{id:assetId}, select:{ locationId, bodegaId }})`
3. `tx.assignment.create({ data: { ...existing, previousBodegaId: asset.bodegaId }})`
4. **NEW** `createMovementInTx(tx, { assetId, movementType:'ASSIGNMENT_DELIVERY', toLocationId: asset.locationId, fromLocationId: asset.locationId, fromBodegaId: asset.bodegaId, toBodegaId: null, movedById: g.userId })`
5. `writeAudit(tx, CREATE)` *(unchanged)* — add `previousBodegaId` to `after`
6. **NEW** also `revalidatePath('/assets')` + `'/movimientos')`

### returnAssignmentAction (inside existing `$transaction`)
1. `tx.assignment.update` → RETURNED *(unchanged)*, also `select previousBodegaId, assetId`
2. **NEW** load `tx.asset.findUnique({ select:{ locationId }})`
3. **NEW** if `previousBodegaId !== null`: `createMovementInTx(tx, { movementType:'ASSIGNMENT_RETURN', toLocationId: asset.locationId, fromLocationId: asset.locationId, fromBodegaId: null, toBodegaId: previousBodegaId, movedById: g.userId })` — helper restores `bodegaId`. If `null` (legacy): skip (no-op).
4. `writeAudit(tx, RETURNED)` *(unchanged)*
5. **NEW** `revalidatePath('/assets')` + `'/movimientos')`

### transferAssignmentAction — NO CHANGE
The asset stays with a person (bodega already `null`); transferring only swaps the
employee. No bodega mutation and no movement, per proposal "Out of Scope". Documented
explicitly so future readers do not assume an omission.

## DTO Changes

`movement.dto.ts`:

    export type MovementType =
      | 'RELOCATION' | 'LOAN' | 'REPAIR' | 'RETURN_FROM_REPAIR' | 'AUDIT'
      | 'ASSIGNMENT_DELIVERY' | 'ASSIGNMENT_RETURN';   // added

`assignment.dto.ts` — add to `AssignmentRow`:

    previousBodegaId: string | null;   // added (mapper must select it)

`CreateAssignmentDTO` unchanged (previousBodegaId is derived server-side, never client input).

## Testing Strategy (Strict TDD — `pnpm vitest`)

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit (helper) | `createMovementInTx` creates movement with correct fields + calls `asset.update` with `{locationId,bodegaId}` | Mock `tx` as object with `assetMovement.create` / `asset.update` vi.fn(); assert call args. No real DB. |
| Unit (helper) | Returns the created movement; `movedById` passed through | Same mock tx, assert return value. |
| Integration | createAssignment: asset.bodegaId→null, previousBodegaId stored, exactly ONE ASSIGNMENT_DELIVERY emitted, toLocationId==asset.locationId | Mock `prisma.$transaction` to invoke callback with a mock tx; assert sequence + movementType + counts. |
| Integration | returnAssignment with previousBodegaId: bodegaId restored, ONE ASSIGNMENT_RETURN | Mock tx; assert restore + type. |
| Integration | returnAssignment with previousBodegaId=null (legacy): NO movement created, no asset.update | Mock tx; assert `createMovementInTx` path not entered. |
| Integration | transferAssignment: NO movement, NO bodega mutation (regression lock) | Mock tx; assert `assetMovement.create` never called. |
| Regression | movimientos `createMovementAction` still creates movement + updates asset after refactor | Existing-style mock tx; assert behavior unchanged. |

Mock `tx` pattern (TDD): write the failing test first with a hand-rolled
`{ assetMovement:{create:vi.fn()}, asset:{update:vi.fn(), findUnique:vi.fn()},
assignment:{...} }`; drive `prisma.$transaction` via
`vi.mocked(prisma.$transaction).mockImplementation(cb => cb(mockTx))`.

## Migration / Rollout
Single additive migration (Dependencies: `prisma migrate dev`). Deploy code + migration
together. No feature flag, no phased rollout, no data backfill.

## Rollback Plan
Revert the code commit. The migration leaves two unused enum values and one nullable
column — both inert and safe to keep. A follow-up migration may drop them later. No
data to undo.

## Open Questions
- [ ] None blocking. (Confirmed: assignment delivery does not change `locationId`, only `bodegaId` — see Decision 2.)
