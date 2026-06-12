# Tasks: assignment-bodega-sync

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280–310 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — within budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All tasks | PR 1 | Schema → helper → actions → DTOs → tests |

---

## Phase 1: Foundation — Schema + Migration + Helper

- [ ] **T-1.1** `prisma/schema.prisma` — Add `ASSIGNMENT_DELIVERY` and `ASSIGNMENT_RETURN` to `MovementType` enum. Add `previousBodegaId String?` to `model Assignment`. Satisfies REQ-S-08, REQ-S-14.

- [ ] **T-1.2** Run `npx prisma migrate dev --name assignment_bodega_sync` to generate and apply the additive migration. Verify migration file created under `prisma/migrations/`. Done condition: `pnpm build` passes, no drift warning.

- [ ] **T-1.3 RED** Write failing unit test in `src/lib/inventory/__tests__/movement.helpers.test.ts`. Test: `createMovementInTx` calls `tx.assetMovement.create` and `tx.asset.update` with correct args, returns created movement, and passes `movedById` through. Use `vi.fn()` mock tx; no real DB. Done condition: test file exists and all assertions fail with `cannot find module`. Satisfies REQ-S-09.

- [ ] **T-1.4 GREEN** Create `src/lib/inventory/movement.helpers.ts`. Implement `createMovementInTx(tx: Prisma.TransactionClient, input: CreateMovementInput): Promise<AssetMovement>`. Internals: `tx.assetMovement.create(...)`, `tx.asset.update({ where:{id}, data:{ locationId: toLocationId, bodegaId: toBodegaId ?? null }})`, return movement. Mirror `locationHasBodegas(client, ...)` PrismaOrTx pattern from `src/lib/location.ts`. Done condition: T-1.3 tests pass green. Satisfies REQ-S-09.

---

## Phase 2: Assignment Actions — Delivery + Return Sync

- [ ] **T-2.1 RED** Add failing integration tests to `src/app/(dashboard)/assignments/__tests__/actions.test.ts` (create if absent). Tests (drive via `vi.mocked(prisma.$transaction).mockImplementation(cb => cb(mockTx))`):
  - Scenario 1: `createAssignmentAction` sets `Asset.bodegaId → null`, persists `previousBodegaId = 'bodega-A'`, emits exactly one `ASSIGNMENT_DELIVERY` movement.
  - Scenario 2: `createAssignmentAction` with `bodegaId = null` stores `previousBodegaId = null`, emits one `ASSIGNMENT_DELIVERY`.
  - Scenario 3: `returnAssignmentAction` with `previousBodegaId = 'bodega-A'` restores `Asset.bodegaId`, emits one `ASSIGNMENT_RETURN`.
  - Scenario 4: `returnAssignmentAction` with `previousBodegaId = null` emits no movement, no `asset.update`. Satisfies REQ-S-05.
  - Scenario 5 (regression): `transferAssignmentAction` emits no movement, does not mutate `bodegaId`. Satisfies REQ-S-07.
  - Scenario 6 (regression): conflict guard still rejects duplicate ACTIVE assignment. Satisfies REQ-S-11.
  Done condition: all new assertions fail for the right reason (missing impl).

- [ ] **T-2.2 GREEN** Modify `src/app/(dashboard)/assignments/actions.ts` — `createAssignmentAction` inside its existing `$transaction`:
  1. After conflict guard: `tx.asset.findUnique({ where:{id: dto.assetId}, select:{ locationId:true, bodegaId:true }})`.
  2. `tx.assignment.create({ ...existing, data:{ ...data, previousBodegaId: asset.bodegaId }})`.
  3. Call `createMovementInTx(tx, { movementType:'ASSIGNMENT_DELIVERY', toLocationId: asset.locationId, fromLocationId: asset.locationId, fromBodegaId: asset.bodegaId, toBodegaId: null, movedById: g.userId, assetId: dto.assetId })`.
  4. Add `revalidatePath('/assets')` and `revalidatePath('/movimientos')`.
  Satisfies REQ-S-01, REQ-S-02, REQ-S-03, REQ-S-04, REQ-S-10.

- [ ] **T-2.3 GREEN** Modify `src/app/(dashboard)/assignments/actions.ts` — `returnAssignmentAction` inside its existing `$transaction`:
  1. Select `previousBodegaId` and `assetId` from the updated assignment.
  2. Load `asset.locationId` via `tx.asset.findUnique`.
  3. If `previousBodegaId !== null`: call `createMovementInTx(tx, { movementType:'ASSIGNMENT_RETURN', toLocationId: asset.locationId, toBodegaId: previousBodegaId, fromBodegaId: null, movedById: g.userId, assetId })`. (Helper performs the `asset.update({ bodegaId: previousBodegaId })` internally.)
  4. If `previousBodegaId === null`: skip — `Asset.bodegaId` stays null; no movement.
  5. Add `revalidatePath('/assets')` and `revalidatePath('/movimientos')`.
  Satisfies REQ-S-05, REQ-S-06, REQ-S-10. Done condition: T-2.1 scenarios 3 + 4 pass green.

- [ ] **T-2.4 VERIFY** Run `pnpm vitest run` and confirm all T-2.1 tests pass (green). No regressions on scenario 5 (transfer) and scenario 6 (conflict guard).

---

## Phase 3: Movimientos Refactor

- [ ] **T-3.1 RED** Add regression test to `src/app/(dashboard)/movimientos/__tests__/actions.test.ts` (create if absent): `createMovementAction` still creates movement row AND updates asset after the refactor. Mock `prisma.$transaction` + mock tx with `vi.fn()`. Done condition: test exists and references `createMovementInTx` import that does not exist yet (or is not called).

- [ ] **T-3.2 GREEN** Modify `src/app/(dashboard)/movimientos/actions.ts` — `createMovementAction`: replace inline `tx.assetMovement.create(...)` + `tx.asset.update(...)` body with a single `createMovementInTx(tx, { ...dto, movedById })` call. Keep `$transaction` wrapper, `locationHasBodegas` guard, and `writeAudit` unchanged. Satisfies REQ-S-09.

- [ ] **T-3.3 VERIFY** Run `pnpm vitest run` — T-3.1 regression test must pass. No other movimientos tests may regress.

---

## Phase 4: DTOs + Mapper

- [ ] **T-4.1** Modify `src/app/(dashboard)/assignments/presentation/dto/assignment.dto.ts` — add `previousBodegaId: string | null` to `AssignmentRow` type. Satisfies REQ-S-14 (mapper-visible). Done condition: TypeScript compiles without error.

- [ ] **T-4.2** Modify `src/app/(dashboard)/movimientos/presentation/dto/movement.dto.ts` — add `'ASSIGNMENT_DELIVERY' | 'ASSIGNMENT_RETURN'` to the `MovementType` union. Satisfies REQ-S-08 (DTO layer). Done condition: TypeScript compiles without error.

- [ ] **T-4.3** Modify `src/app/(dashboard)/assignments/presentation/mappers/assignment.mapper.ts` — add `previousBodegaId` to the Prisma `select` object and map it into `AssignmentRow`. Done condition: `pnpm build` passes, no TS error on `previousBodegaId` access.

---

## Phase 5: Final Verification

- [ ] **T-5.1** Run `pnpm vitest run` — all test suites pass, no skipped tests, no regressions on analytics `disponibles` count path. Satisfies REQ-S-12.

- [ ] **T-5.2** Run `pnpm build` — clean build, no TypeScript errors.

- [ ] **T-5.3** Manual smoke: create an assignment for an asset with a bodega, verify `/movimientos` shows `ASSIGNMENT_DELIVERY` row (Scenario 7, REQ-S-13). Return the assignment, verify asset bodega is restored in DB.

---

## Dependency Order Summary

```
T-1.1 (schema) → T-1.2 (migrate) → T-1.3 (RED helper test) → T-1.4 (GREEN helper)
                                                                       ↓
                                               T-2.1 (RED assign tests) → T-2.2 → T-2.3 → T-2.4
                                                                       ↓
                                               T-3.1 (RED movim test) → T-3.2 → T-3.3
                                                                       ↓
                                               T-4.1 → T-4.2 → T-4.3 (parallel with Phase 3)
                                                                       ↓
                                                              T-5.1 → T-5.2 → T-5.3
```

Phases 3 and 4 are unblocked once T-1.4 (helper) is green and can proceed in parallel.
