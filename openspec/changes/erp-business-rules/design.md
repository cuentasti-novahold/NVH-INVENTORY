# Technical Design — erp-business-rules

Status: design
Project: nvh-inventory
Artifact store: hybrid (openspec + engram)
Depends on: proposal (`sdd/erp-business-rules/proposal`)
Test runner: `pnpm vitest run` — Strict TDD ACTIVE. Do not touch the 16 pre-existing failures.

---

## 1. Architecture approach

All three fixes live in the **Server Action write boundary** (DDD presentation/application edge). The binding invariant is enforced server-side; client form config is UX-only and never authoritative. This is consistent with the existing codebase: every action re-validates with Yup before any Prisma write.

Layering decisions:

- **Static, unconditional invariants** (Issue 1: locationId required) → expressed in the Yup schema (`asset.schema.ts`) + DTO type tightening. The schema is the single source of truth already invoked by `createAssetAction`.
- **Data-dependent / conditional invariants** (Issue 2: bodega required only when the location has bodegas) → cannot be static Yup, because validity depends on live DB state of the chosen location. Enforced via a **shared application helper** (`locationHasBodegas`) executed inside the same transaction/query path as the write, in both `assets/actions.ts` and `movimientos/actions.ts`.
- **Referential / lifecycle guards** (Issue 3: cannot deactivate an employee with ACTIVE assignments) → a pre-transaction read guard, mirroring the existing `deleteEmployeeAction` pattern at `employees/actions.ts:384`.

DB schema migration for `Asset.locationId` (table confirmed empty — safe). No data backfill. No new UI components. No new routes.

---

## 2. Shared helper — placement decision (ADR-1)

**Decision**: place `locationHasBodegas` in **`src/lib/location.ts`** (new file).

**Rationale**:
- `src/lib/` already hosts cross-cutting domain helpers consumed by multiple action files: `depreciation.ts`, `audit.ts`, `permissions.ts`, `prisma.ts`. These are plain functions, not Server Actions, imported directly. The helper fits this exact shape and convention.
- `src/modules/location/application/` does **not exist** (verified — no files under `src/modules/location/`). Creating a full DDD module slice for a single count query is over-engineering and inconsistent with how the rest of the location code is organized (it lives under `src/app/(dashboard)/settings/locations/`).
- Inlining in each action duplicates the query across two files and violates DRY; the proposal explicitly calls for a shared helper.

**Rejected alternatives**:
- `src/modules/location/application/locationHasBodegas.ts` — rejected: no module scaffold exists; would be the only file in a new module tree.
- Inline in both actions — rejected: duplication, and the proposal mandates DRY.
- A Server Action wrapper — rejected: this is an internal invariant check, not a client-callable boundary; it must run inside the caller's transaction (`tx`), which Server Actions cannot do.

### Helper signature

```ts
// src/lib/location.ts
import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

/**
 * Returns true if the given location currently has at least one bodega.
 * Pass the active transaction client (tx) when called inside a $transaction
 * so the count is consistent with the surrounding write.
 */
export async function locationHasBodegas(
  client: PrismaOrTx,
  locationId: string,
): Promise<boolean> {
  const count = await client.bodega.count({ where: { locationId } });
  return count > 0;
}
```

Schema fact: `Bodega.locationId` (non-null FK) → `Location.bodegas: Bodega[]` (schema.prisma:126-138). The count query is indexed by FK; cost is negligible (Risk C accepted in proposal).

---

## 3. Issue 1 — Asset must have a location (HIGH)

App-layer enforcement + DB constraint (assets table confirmed empty — no backfill needed).

### 3.0 DB schema migration

**File `prisma/schema.prisma`**, Asset model:
- Change `locationId String?` → `locationId String` (remove nullability)
- `bodegaId` stays `String?` — conditional logic handles it; not all locations have bodegas

**Migration command**: `npx prisma migrate dev --name require-asset-location`

Generated SQL will be `ALTER TABLE assets MODIFY location_id VARCHAR(191) NOT NULL` — succeeds because the table is empty. After this change, the DB enforces the invariant at the storage layer in addition to the app layer.

### 3.1 Create path (binding)

**File `src/app/(dashboard)/assets/presentation/schemas/asset.schema.ts`**
- `buildAssetCreateSchema`, line 52: change
  `locationId: yup.string().nullable().optional(),`
  →
  `locationId: yup.string().trim().required('La sede es obligatoria'),`
  (drop `.nullable()`/`.optional()`).

**File `src/app/(dashboard)/assets/presentation/dto/asset.dto.ts`**
- `CreateAssetDTO`, line 66: change `locationId?: string | null;` → `locationId: string;` (required, non-null).
- `UpdateAssetDTO` stays `Partial<CreateAssetDTO>` (line 72) — so on update `locationId?: string` (optional but, when present, non-null string). See 3.3 for why update is intentionally NOT forced required.

**File `src/app/(dashboard)/assets/actions.ts`**
- Create transaction, line 330: change `locationId: dto.locationId ?? null,` → `locationId: dto.locationId,`. After the schema change `dto.locationId` is a guaranteed non-empty string, so the `?? null` is dead and misleading.
- Audit `after` block line 348 (`locationId: created.locationId ?? null`) — leave as-is (defensive read of persisted row; harmless).

**File `src/app/(dashboard)/assets/presentation/forms/asset-form.config.ts`** (client UX only)
- In `buildAssetFormConfig`, the create-branch `locationId` autocomplete field (lines 278-289): add `required: true` to mark the field in the UI. This is cosmetic/early-feedback; the server schema is authoritative.

### 3.2 Importer path (Risk D — must reject, not persist null)

**File `src/app/(dashboard)/assets/actions.ts`**, import loop ~lines 591-599.
- Current behavior: a row with blank `location` falls through with `locationId = null` and is inserted. That silently recreates the defect for bulk imports.
- Change: when `r.location` is blank/empty, throw the existing sentinel so the row is reported as an error instead of inserted:
  ```ts
  if (!r.location?.trim()) throw new Error('LOCATION_NOT_FOUND:(vacío)');
  ```
  Place this BEFORE the existing `if (r.location?.trim()) { ... }` lookup block, then the lookup block can keep its current shape (or be simplified, since location is now guaranteed present). The existing catch at line 648 already maps `LOCATION_NOT_FOUND:` to a Spanish "Sede no encontrada" error row — reuse it. Bodega handling in the importer is governed by Issue 2 (see 4.4).

### 3.3 Update path — intentional non-enforcement (ADR-2)

**Decision**: do NOT force `locationId` required in `buildAssetUpdateSchema`.

**Rationale**:
- The asset form renders `locationId` as a **readonly** field when editing (asset-form.config.ts lines 270-277): location is changed via the Movimientos flow, not the asset edit form. The edit form never submits a new `locationId`, so forcing required there would break edits of legacy rows whose `locationId` is currently null without giving the user any control to fix it (proposal Risk B: legacy null rows become un-editable — accepted as a nudge, but we will NOT actively break the edit path).
- Update keeps `locationId?: string` (line 97 stays `nullable().optional()`), so partial updates that omit `locationId` are valid and the existing `if (dto.locationId !== undefined)` guard (actions.ts:412) is unchanged.

**Net effect**: new assets MUST have a location; the relocation flow (Movimientos) is the canonical way to change it; legacy null assets are not actively broken.

---

## 4. Issue 2 — Bodega required when location has bodegas (MEDIUM)

Conditional invariant. Enforced at three write entry points, all using `locationHasBodegas`.

### 4.1 Asset create — `createAssetAction`

**File `src/app/(dashboard)/assets/actions.ts`**, inside the existing `$transaction` (after `assetCode` resolution, before `tx.asset.create`, around line 305):

```ts
if (!dto.bodegaId && (await locationHasBodegas(tx, dto.locationId))) {
  // abort the transaction with a typed validation error
  throw new BodegaRequiredError();
}
```

Because `createAssetAction` validates and then enters the transaction, and the action returns `ActionResult`, prefer NOT to throw a raw error that the generic `catch` maps to `UNKNOWN`. Two concrete options:

**Chosen (ADR-3a)**: run the check OUTSIDE the transaction, right after Yup validation (after line 282), before opening the `$transaction`. Use the base `prisma` client:
```ts
if (!dto.bodegaId && (await locationHasBodegas(prisma, dto.locationId))) {
  return err('VALIDATION', 'Datos inválidos', { bodegaId: 'La bodega es obligatoria para esta sede' });
}
```
This returns a clean field-level VALIDATION error (consistent with `yupToFieldErrors` shape) and avoids polluting the transaction. The tiny TOCTOU window (a bodega added between check and create) is acceptable: it would only ever make a previously-valid submission stricter, and the asset create does not itself mutate bodegas.

**Rejected (ADR-3b)**: throwing inside the transaction. Rejected because the generic `catch` at line 360 maps everything to `err('UNKNOWN', ...)`, losing the field-level message; adding a custom error class + catch branch is more surface than the out-of-transaction check needs.

### 4.2 Asset update — `updateAssetAction`

The asset edit form renders `locationId` and `bodegaId` as **readonly** (lines 270-310) — neither is submitted on edit. Therefore no conditional bodega check is needed in `updateAssetAction`. Adding one would be dead code. (The relocation path covers bodega changes — see 4.3.) **No change to `updateAssetAction`.**

### 4.3 Movement create — `createMovementAction`

**File `src/app/(dashboard)/movimientos/actions.ts`**. Here the bodega check MUST run **inside the `$transaction`** (line 163), because the movement both reads location/bodega state and writes the asset's new location — they must be consistent.

Insert after `dto` validation succeeds and inside the transaction, before `tx.assetMovement.create` (line 164):

```ts
const created = await prisma.$transaction(async (tx) => {
  if (!dto.toBodegaId && (await locationHasBodegas(tx, dto.toLocationId))) {
    throw new ValidationAbort('toBodegaId', 'La bodega de destino es obligatoria para esta sede');
  }
  // ...existing create + asset.update + audit
});
```

Because `createMovementAction`'s catch (line 206) is a bare `catch { return err('UNKNOWN', ...) }`, we must surface the field error. **Design**: define a small local sentinel and branch the catch:

```ts
class ValidationAbort extends Error {
  constructor(public field: string, public msg: string) { super(msg); }
}
// ...
} catch (e) {
  if (e instanceof ValidationAbort) return err('VALIDATION', 'Datos inválidos', { [e.field]: e.msg });
  return err('UNKNOWN', 'Error al registrar traslado');
}
```

**Transaction boundary decision (ADR-4)**: movement check runs inside `tx`; asset-create check runs outside `tx`. Asymmetry is justified: the movement transaction reads-and-writes the same location data atomically, so the invariant read must share the snapshot; the asset-create transaction only generates a code and inserts — the bodega rule is a pure pre-condition on input that gains nothing from being inside the tx and is cleaner as a pre-check returning a field error.

### 4.4 Importer bodega handling

**File `src/app/(dashboard)/assets/actions.ts`** import loop (~line 601). After resolving `locationId`, add:
```ts
if (!bodegaId && (await locationHasBodegas(tx, locationId))) {
  throw new Error('BODEGA_REQUIRED:(la sede requiere bodega)');
}
```
Add a catch branch mapping `BODEGA_REQUIRED:` → `errors.push({ row: rowNum, field: 'bodega', message: 'La sede requiere bodega' })`. Here we use `tx` because the import loop runs each row in its own transaction (line 577) and `locationId` was resolved within it.

### 4.5 Client UX — how conditional-required flows to the form (ADR-5)

The conditional rule is **server-authoritative**; the form gives early feedback but is never the enforcement point.

- **Movimientos form** (`movimiento-form.config.ts`): the `toBodegaId` field (lines 94-102) is a `select` already populated by the `toLocationId` cascade (`searchBodegasByLocationAction`). The cascade already returns the bodega options for the chosen location. UX enhancement: when the cascade returns a **non-empty** options list, the bodega is effectively required. Since `FormConfig.required` is a static boolean and this is dynamic, the authoritative path is the server VALIDATION error (4.3) which surfaces on `toBodegaId` via the standard field-error rendering. Optionally update the placeholder copy from `'Seleccionar bodega (opcional)'` to neutral `'Seleccionar bodega…'` to avoid implying it is always optional. No new dynamic-required machinery is introduced.
- **Asset form** (`asset-form.config.ts`): create-branch `bodegaId` autocomplete (lines 298-310) already uses `watchField: 'locationId'`. We do NOT add static `required: true` (it is conditional). The server returns the field error on `bodegaId` when the chosen location has bodegas and none was picked; `CrudFormDialog` renders server field errors against the matching `field.name` (`bodegaId` matches exactly — satisfies the "field.name must match backend DTO field name" rule).

**Decision**: rely on the existing server-field-error rendering for the conditional message instead of inventing client-side dynamic-required logic. This keeps the binding rule in one place (server) and avoids divergence between two validators. Placeholder copy tweaks are the only client edits.

---

## 5. Issue 3 — Deactivation guard (HIGH)

**File `src/app/(dashboard)/employees/actions.ts`**, `deactivateEmployeeAction` (line 432).

Mirror the `deleteEmployeeAction` guard (line 384-398) but scope to **ACTIVE assignments only** (intentional asymmetry per proposal: deactivate blocks on current custody; delete blocks on any historical assignment).

Insert the guard **OUTSIDE / BEFORE** the `$transaction` (after the `requireWrite` guard, before `getRequestMeta`/the transaction):

```ts
const row = await prisma.employee.findUnique({
  where: { id },
  select: { _count: { select: { assignments: { where: { status: 'ACTIVE' } } } } },
});
if (!row) return err('NOT_FOUND', 'Empleado no encontrado');
if (row._count.assignments > 0)
  return err(
    'HAS_CHILDREN',
    `No se puede desactivar: tiene ${row._count.assignments} asignaciones activas. Registrá la devolución de los activos primero.`,
  );
```

Schema facts: `Assignment.status` is enum `AssignmentStatus { ACTIVE, RETURNED, TRANSFERRED }` (schema.prisma:309,317-321); filtered `_count` on a relation is supported by Prisma 7 (`_count: { select: { assignments: { where: { status: 'ACTIVE' } } } }`).

**Transaction boundary decision (ADR-6)**: guard runs before the transaction, exactly like `deleteEmployeeAction`. Rationale: it is a pure read pre-condition; running it outside keeps the write transaction minimal and matches the established pattern in the same file (consistency > novelty). The TOCTOU window (an assignment becoming active between check and update) is negligible and no worse than the existing delete guard.

**Error code**: reuse `HAS_CHILDREN` (same family the delete guard uses) so the client treats it as a known business-rule rejection rather than a generic failure.

---

## 6. Component / data-flow summary

```
CREATE ASSET (server-authoritative)
  client form (required:true UX)
    -> createAssetAction
       -> buildAssetCreateSchema.validate  [locationId required]   (binding)
       -> locationHasBodegas(prisma, locationId) pre-check         (binding, conditional bodega)
       -> $transaction { code gen, asset.create(locationId=dto), audit }

UPDATE ASSET
  location/bodega are readonly in edit form -> not submitted -> no new checks

MOVEMENT CREATE
  client form (cascade fills bodega options)
    -> createMovementAction
       -> createMovementSchema.validate
       -> $transaction {
            locationHasBodegas(tx, toLocationId) -> ValidationAbort if missing bodega
            assetMovement.create, asset.update(location/bodega), audit
          }
       -> catch maps ValidationAbort -> VALIDATION field error on toBodegaId

IMPORT ASSETS
  per-row $transaction
    -> blank location -> throw LOCATION_NOT_FOUND -> error row (no insert)
    -> locationHasBodegas(tx, locationId) && !bodegaId -> throw BODEGA_REQUIRED -> error row

DEACTIVATE EMPLOYEE
  -> deactivateEmployeeAction
     -> requireWrite
     -> pre-check: count ACTIVE assignments -> HAS_CHILDREN if > 0   (binding)
     -> $transaction { employee.update(isActive=false), audit }
```

---

## 7. Test strategy (Strict TDD — `pnpm vitest run`)

Write failing tests first, then implement. Do not modify the 16 pre-existing failures.

**Helper unit (`src/lib/__tests__/location.test.ts` — new)**
- `locationHasBodegas` returns `true` when count > 0, `false` when 0. Mock the prisma/tx client's `bodega.count`.

**Asset schema unit (`asset.schema` tests)**
- `buildAssetCreateSchema` rejects when `locationId` is missing/empty (expect `La sede es obligatoria`).
- `buildAssetCreateSchema` accepts when `locationId` present.
- `buildAssetUpdateSchema` still accepts omitted `locationId` (no regression).

**Asset action (`createAssetAction` tests)**
- Rejects with VALIDATION + `bodegaId` field error when location has bodegas and no bodega supplied (mock `locationHasBodegas`/`bodega.count` → >0).
- Succeeds (no bodega error) when location has zero bodegas.
- Persists `locationId` (asserts it is passed straight through, not coerced to null).

**Movement action (`createMovementAction` tests)**
- Rejects with VALIDATION + `toBodegaId` field error when `toLocationId` has bodegas and `toBodegaId` empty.
- Succeeds when destination location has no bodegas or a bodega is provided; asserts the transaction still creates movement + updates asset.

**Importer (createAssets/import tests, if a harness exists)**
- Row with blank location → reported as `field: 'location'` error, NOT inserted.
- Row whose location has bodegas but blank bodega → `field: 'bodega'` error, NOT inserted.

**Employee action (`deactivateEmployeeAction` tests)**
- Rejects with `HAS_CHILDREN` when the employee has ≥1 ACTIVE assignment (mock filtered `_count` > 0). Asserts `employee.update` is NOT called.
- Succeeds (sets isActive=false, writes audit) when zero ACTIVE assignments — even if RETURNED/TRANSFERRED assignments exist (asserts the filter is `status: 'ACTIVE'`, distinguishing from the delete guard).

Layer rule: schema invariants → schema unit tests; conditional/lifecycle invariants → action tests with mocked prisma; helper → its own unit. UI form config changes are UX-only and need no tests.

---

## 8. ADR index

- **ADR-0** DB `NOT NULL` on `Asset.locationId` included (assets table confirmed empty; migration is safe without backfill).
- **ADR-1** Helper in `src/lib/location.ts` (matches existing lib convention; no module scaffold exists).
- **ADR-2** Update path does NOT force locationId required (edit form is readonly; avoid breaking legacy rows).
- **ADR-3** Asset-create bodega check runs as a pre-transaction field-error check (clean VALIDATION result vs generic UNKNOWN).
- **ADR-4** Movement bodega check runs INSIDE the tx (atomic with asset.update snapshot); asset-create check OUTSIDE (pure pre-condition).
- **ADR-5** Conditional-required bodega surfaced via server field errors, not client dynamic-required (single source of truth).
- **ADR-6** Deactivate guard runs BEFORE the transaction, scoped to status=ACTIVE (mirrors delete guard; intentional ACTIVE-only asymmetry).

## 9. Risks / open items carried forward

- TOCTOU on both bodega pre-checks and the deactivate guard — accepted, no worse than existing delete guard; document only.
- `ValidationAbort` is a local class in `movimientos/actions.ts`; if reuse grows, promote to a shared error type (out of scope now).
- DB `NOT NULL` on `Asset.locationId` is included in this change (table empty, safe). `bodegaId` stays nullable — conditional logic governs it.
- Confirm a movement-action test harness exists; if mocking `prisma.$transaction` is awkward, the existing action test patterns in the repo are the reference.
