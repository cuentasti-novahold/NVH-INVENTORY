# Apply Progress: assignment-bodega-sync

## Status: done (partial — T-1.2 migration blocked, T-5.2/5.3 need DB)

## Test Results (pnpm vitest run)
- Baseline: 368 pass / 17 fail / 385 total
- After apply: 382 pass / 17 fail / 399 total
- New tests added: 14 (all green)
- Regressions: 0

## Tasks

### Phase 1: Foundation
- [x] T-1.1 — schema.prisma: added ASSIGNMENT_DELIVERY + ASSIGNMENT_RETURN to MovementType enum; added previousBodegaId String? to Assignment model
- [ ] T-1.2 — Migration: BLOCKED (DB not reachable at localhost:3306). Run `npx prisma migrate dev --name assignment_bodega_sync` when DB available.
- [x] T-1.3 RED — movement.helpers.test.ts written, confirmed failing (cannot find module)
- [x] T-1.4 GREEN — src/lib/inventory/movement.helpers.ts created; all 6 tests pass

### Phase 2: Assignment Actions
- [x] T-2.1 RED — Scenarios 1,2,3 written (RED confirmed), 4,5,6 pass (absence guards)
- [x] T-2.2 GREEN — createAssignmentAction: asset.findUnique snapshot + assignment.create(previousBodegaId) + createMovementInTx(ASSIGNMENT_DELIVERY)
- [x] T-2.3 GREEN — returnAssignmentAction: if previousBodegaId !== null → createMovementInTx(ASSIGNMENT_RETURN); else null-safe skip
- [x] T-2.4 VERIFY — 382 pass, 17 fail (all pre-existing)

### Phase 3: Movimientos Refactor
- [x] T-3.1 RED — 2 regression tests for createMovementInTx usage confirmed failing
- [x] T-3.2 GREEN — movimientos/actions.ts: inline create+update replaced with createMovementInTx
- [x] T-3.3 VERIFY — all 27 movimientos tests pass

### Phase 4: DTOs + Mapper
- [x] T-4.1 — assignment.dto.ts: previousBodegaId: string | null added to AssignmentRow
- [x] T-4.2 — movement.dto.ts: ASSIGNMENT_DELIVERY | ASSIGNMENT_RETURN added to MovementType union
- [x] T-4.3 — assignment.mapper.ts: previousBodegaId select+map; columns-movimientos.tsx: new labels/colors
- [x] T-4.4 (implicit) — columns-movimientos.tsx: ASSIGNMENT_DELIVERY + ASSIGNMENT_RETURN labels/colors added

### Phase 5: Final Verification
- [x] T-5.1 — pnpm vitest run: 382 pass, 17 fail (all pre-existing), 0 regressions
- [ ] T-5.2 — pnpm build: blocked (no DB for Prisma generate). No TS errors in modified source files.
- [ ] T-5.3 — Manual smoke: requires running DB

## TDD Evidence
| Task | Phase | Result |
|------|-------|--------|
| T-1.3 | RED | 6 tests: "Cannot find module" |
| T-1.4 | GREEN | 6 tests pass |
| T-2.1 Sc1,2,3 | RED | 3 new tests fail (missing impl) |
| T-2.2/2.3 | GREEN | Scenarios 1-6 pass |
| T-3.1 | RED | 2 regression tests fail |
| T-3.2 | GREEN | 27 movimientos tests pass |

## Files Created/Modified
- `prisma/schema.prisma` — MovementType enum + Assignment.previousBodegaId
- `src/lib/inventory/movement.helpers.ts` — NEW: createMovementInTx
- `src/lib/inventory/__tests__/movement.helpers.test.ts` — NEW: 6 unit tests
- `src/app/(dashboard)/assignments/actions.ts` — bodega-sync in create + return
- `src/app/(dashboard)/assignments/__tests__/actions.test.ts` — 8 new scenarios + mocks
- `src/app/(dashboard)/movimientos/actions.ts` — refactored to createMovementInTx
- `src/app/(dashboard)/movimientos/__tests__/actions.test.ts` — 2 regression tests + audit mock
- `src/app/(dashboard)/assignments/presentation/dto/assignment.dto.ts` — previousBodegaId
- `src/app/(dashboard)/movimientos/presentation/dto/movement.dto.ts` — MovementType union
- `src/app/(dashboard)/assignments/presentation/mappers/assignment.mapper.ts` — previousBodegaId
- `src/app/(dashboard)/movimientos/presentation/components/columns-movimientos.tsx` — new type labels

## Deviations from Design
1. **Migration blocked**: local DB not available. Run migration before deploying.
2. **`as any` cast**: `previousBodegaId` in `assignment.create({ data: createData })` uses `createData: any` because generated Prisma client doesn't have the column until migration runs.
3. **Scenario 4 spec vs design**: Spec said "emits ASSIGNMENT_RETURN" for null previousBodegaId; design says "skip no-op". Design wins — null path emits NO movement (matches REQ-S-05 null-safe language and the design HIGH RISK note).
