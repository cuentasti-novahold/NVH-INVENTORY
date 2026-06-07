# Tasks: erp-business-rules

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 130–170 |
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
| 1 | All three ERP business-rule fixes | PR 1 | Single PR — ~150 lines; includes tests, migration, helper, action guards |

---

## Phase 1: Foundation — Helper + Schema + Migration

- [x] 1.1 [TEST] Write RED test in `src/lib/__tests__/location.test.ts` — `locationHasBodegas` returns `true` when bodega count ≥ 1, `false` when 0. Mock Prisma client. Confirm `pnpm vitest run` fails.
- [x] 1.2 [IMPL] Create `src/lib/location.ts` — export `locationHasBodegas(client: PrismaOrTx, locationId: string): Promise<boolean>` using `client.bodega.count`. Make tests GREEN.
- [x] 1.3 [TEST] Write RED test in `src/app/(dashboard)/assets/presentation/schemas/asset.schema.ts` test file — `buildAssetCreateSchema` rejects `null` and `""` for `locationId` (scenarios S-01-B, S-01-C). Confirm RED.
- [x] 1.4 [IMPL] Update `src/app/(dashboard)/assets/presentation/schemas/asset.schema.ts` — `buildAssetCreateSchema`: set `locationId` to `.string().trim().required('La sede es obligatoria')`. Make test GREEN.
- [x] 1.5 [IMPL] Update `src/app/(dashboard)/assets/presentation/dto/asset.dto.ts` — `CreateAssetDTO.locationId: string` (remove `| null`).
- [x] 1.6 [IMPL] Run migration: `npx prisma migrate dev --name require-asset-location` — changes `Asset.locationId String?` → `String` in `prisma/schema.prisma`. Verify migration file generated under `prisma/migrations/`.

---

## Phase 2: Core — Action Guards (Issues 1, 2, 3)

- [x] 2.1 [TEST] Add to `src/app/(dashboard)/assets/__tests__/actions.test.ts` — `createAssetAction` returns `err('VALIDATION')` with `locationId` key when locationId is absent (S-01-B). Confirm RED.
- [x] 2.2 [IMPL] In `src/app/(dashboard)/assets/actions.ts` line ~330 — remove `?? null` fallback on `locationId` assignment. Make 2.1 test GREEN.
- [x] 2.3 [TEST] Add to `src/app/(dashboard)/assets/__tests__/actions.test.ts` — `createAssetAction` returns `err('VALIDATION')` with `bodegaId` key when location has bodegas and bodegaId is absent (S-02-B); returns `ok` when location has zero bodegas and bodegaId is null (S-02-C). Confirm RED.
- [x] 2.4 [IMPL] In `src/app/(dashboard)/assets/actions.ts` — after Yup validation, before `$transaction`: call `locationHasBodegas(prisma, dto.locationId)` and return `err('VALIDATION', 'Datos inválidos', { bodegaId: '...' })` if bodegas exist and bodegaId is absent (S-02-B, S-02-D). Import helper from `src/lib/location.ts`. Make tests GREEN.
- [x] 2.5 [TEST] Add to `src/app/(dashboard)/movimientos/__tests__/actions.test.ts` (file may already exist — add to it) — `createMovementAction` returns `err('VALIDATION')` with `toBodegaId` key when toLocation has bodegas and toBodegaId absent (S-03-B); returns `ok` when toLocation has zero bodegas (S-03-C). Confirm RED.
- [x] 2.6 [IMPL] Modify `src/app/(dashboard)/movimientos/actions.ts` (existing file, `createMovementAction` at ~line 145) — define local `ValidationAbort` sentinel class; inside `$transaction` call `locationHasBodegas(tx, dto.toLocationId)` and `throw new ValidationAbort(...)` on violation; update catch to map `ValidationAbort` → `err('VALIDATION', 'Datos inválidos', { toBodegaId: '...' })`. Import helper from `src/lib/location.ts`. Make tests GREEN.
- [x] 2.7 [TEST] Add to `src/app/(dashboard)/employees/__tests__/actions.test.ts` — `deactivateEmployeeAction` returns `err('HAS_CHILDREN')` when employee has ≥1 ACTIVE assignment (S-04-B); returns `ok` when assignments are RETURNED only (S-04-C); returns `ok` when assignments are TRANSFERRED only (S-04-D). Confirm RED.
- [x] 2.8 [IMPL] In `src/app/(dashboard)/employees/actions.ts` `deactivateEmployeeAction` — add pre-transaction query: `findUnique` with `_count: { select: { assignments: { where: { status: 'ACTIVE' } } } }`; return `err('NOT_FOUND')` if row missing, `err('HAS_CHILDREN', ...)` if count > 0. Make tests GREEN.

---

## Phase 3: Importer Patch (Issue 1 + 2)

- [x] 3.1 [IMPL] In the assets importer (locate via `Grep "LOCATION_NOT_FOUND"` — likely in `assets/actions.ts` or a dedicated import action) — add blank-location guard: throw `new Error('LOCATION_NOT_FOUND:(vacío)')` before the lookup block for rows with empty locationId.
- [x] 3.2 [IMPL] In the same importer path — after locationId is resolved, add `locationHasBodegas` check: if location has bodegas and bodegaId is blank, throw `new Error('BODEGA_REQUIRED:(la sede requiere bodega)')`.

---

## Phase 4: UX Tweaks (Issues 1 + 2 form config)

- [x] 4.1 [IMPL] Update `src/app/(dashboard)/assets/presentation/forms/asset-form.config.ts` — set `required: true` on `locationId` field config (UX label/indicator only; server action is authoritative).
- [x] 4.2 [IMPL] In the movement form config (locate via `Grep "toBodegaId"`) — update placeholder text on `toBodegaId` from `"(opcional)"` to `"Seleccionar bodega…"` (remove optional hint).

---

## Phase 5: Verify + Cleanup

- [x] 5.1 [VERIFY] Run `pnpm vitest run` — confirm all 10 new tests pass (T-01-B, T-01-C, T-02-B, T-02-C, T-03-B, T-03-C, T-04-A, T-04-B, T-04-C, T-04-D) and pre-existing 16 failures remain unchanged (not increased).
- [x] 5.2 [VERIFY] Run `pnpm build` — confirm no TypeScript errors from `locationId` type tightening in DTO and schema.
- [x] 5.3 [VERIFY] Confirm `prisma/schema.prisma` has `locationId String` (NOT NULL) and migration file exists under `prisma/migrations/`.
- [x] 5.4 [VERIFY] Check `src/lib/location.ts` is the only definition of `locationHasBodegas` — no inline duplicates in actions.
