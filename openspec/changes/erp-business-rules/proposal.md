# Proposal — erp-business-rules

**Change**: `erp-business-rules`
**Project**: nvh-inventory
**Status**: proposed
**Date**: 2026-06-07

---

## 1. Intent

### Problem
The inventory ERP currently allows three operations that silently break the data integrity guarantees an asset-management system is supposed to enforce. None of them throw — they succeed, and the corruption surfaces later as untraceable assets and broken chain-of-custody.

1. **Assets without a physical location.** An asset can be created and persisted with `locationId = null`. An ERP whose entire purpose is to answer "where is this asset?" must never hold an asset that has no answer. Today the nullability flows end-to-end: schema → Yup schema → DTO → form config → action fallback (`dto.locationId ?? null`).

2. **Missing bodega when the chosen location has bodegas.** A Location (Sede) may contain Bodegas. When it does, an asset or movement targeting that Location must land in a specific Bodega — otherwise we know the building but not the shelf. Today `bodegaId` is optional unconditionally, so a Location *with* bodegas can receive an asset that points at no bodega. The conditional invariant ("required IFF the location has bodegas") is enforced nowhere.

3. **Deactivating an employee who still holds assigned assets.** `deactivateEmployeeAction` flips `isActive: false` inside a transaction with no pre-check for `ACTIVE` assignments. The custodian disappears while still legally responsible for assets. `deleteEmployeeAction` already guards this case (`_count.assignments > 0`) and even tells the user to "use Desactivar instead" — routing them straight into the unguarded path. The guard exists on the wrong door.

### Why now
These are HIGH/MEDIUM severity correctness defects, not features. Each one produces records that are technically valid at the DB level but semantically invalid as ERP data. The longer they run, the more orphaned/untraceable rows accumulate, and the harder a future cleanup migration becomes. Fixing the write paths now caps the blast radius.

### Success looks like
- It is impossible to persist an asset without a location through the application.
- When a selected Location has bodegas, both asset creation/edit and movements require a bodega; when it has none, bodega stays optional.
- Deactivating an employee with one or more `ACTIVE` assignments is blocked with a clear Spanish error directing the user to reassign/return first — mirroring the existing delete guard.
- All three guards are enforced server-side (the source of truth) and reflected client-side (UX), validated by tests under Strict TDD.

---

## 2. Scope

### In scope
- **Issue 1 — Asset location required**: make `locationId` required across asset write paths (Yup schema, DTO contract, form config `required`, action — remove the silent `?? null` fallback for create). Server-side validation is authoritative.
- **Issue 2 — Conditional bodega**: enforce "bodega required when the target Location has bodegas" in:
  - asset create/edit action,
  - `createMovementAction`,
  - and surface the same rule client-side in `asset-form.config.ts` and `movimiento-form.config.ts`.
- **Issue 3 — Deactivation guard**: add an `ACTIVE`-assignment pre-check to `deactivateEmployeeAction`, returning a `HAS_CHILDREN`-style blocking error consistent with `deleteEmployeeAction`.
- Tests for each rule (server action level + schema level) per Strict TDD.
- Error copy in Spanish (project convention).

### Out of scope
- **No data migration / backfill** of existing assets that already have `null` location or bodega. This proposal stops new corruption; remediating historical rows is a separate change (it requires product decisions on default locations and is risky to automate).
- **No schema-level `NOT NULL` migration** on `Asset.locationId` in this change (see Risks — Tradeoff A). Enforcement is at the application layer first; a DB constraint can follow once historical nulls are remediated.
- No changes to the Location/Bodega hierarchy model, the Assignment lifecycle enum, or movement types.
- No new UI screens — only validation/required-field changes on existing forms.
- No changes to import/bulk-create location inference logic beyond making it honor the same required-location rule (the importer already derives `locationId`/`bodegaId` from row data around `actions.ts:591`).

---

## 3. Proposed approach

### Issue 1 — Asset must have a location (HIGH)
**Layered enforcement, server-authoritative:**
- `asset.schema.ts`: change `locationId` from `.nullable().optional()` to `.required('La ubicación es obligatoria')` (string, non-empty).
- `asset.dto.ts`: tighten the create DTO so `locationId: string` (drop `| null` on create; edit DTO may keep partial semantics but never allow clearing to null).
- `asset-form.config.ts`: add `required: true` to the location field; ensure the field renders as mandatory.
- `actions.ts` (create, ~line 330): remove the `?? null` fallback for `locationId` on create so a missing value is a validation failure, not a silent null. Validation runs through the Yup schema before persistence, so the action relies on the schema as the gate.

**Rationale**: the defect spans every layer, so the fix must too — but the *binding* enforcement is the server action validating against the Yup schema. Client `required` is UX, not security. We do not yet add a DB `NOT NULL` constraint (see Tradeoff A).

### Issue 2 — Bodega required when location has bodegas (MEDIUM)
**Conditional invariant evaluated against live data:**
- Introduce a small shared check (e.g. `locationHasBodegas(tx | prisma, locationId): Promise<boolean>`) used by both asset and movement create/edit actions. Inside the action (before persistence, ideally within the existing `$transaction` for movements), if the target location has bodegas and `bodegaId` is null/empty → return a `VALIDATION` error keyed to the bodega field.
- Client side: `movimiento-form.config.ts` already loads bodega options conditionally via `searchBodegasByLocationAction` and shows the select only when a location is chosen. Extend it so that when that search returns ≥1 bodega, the field is marked required; when it returns none, it stays optional/hidden. Mirror the same conditional-required logic in `asset-form.config.ts`.

**Rationale**: the rule is data-dependent ("does THIS location have bodegas right now?"), so it cannot be a static Yup `.required()`. It must query the location's bodega count. Server is authoritative; the form mirrors it for UX. Evaluating inside the movement `$transaction` keeps the check consistent with the write under concurrent bodega changes.

### Issue 3 — Block deactivation with active assignments (HIGH)
**Mirror the existing delete guard, narrowed to ACTIVE:**
- In `deactivateEmployeeAction`, before the `$transaction`, query the employee's assignments filtered to `status: 'ACTIVE'`. If count > 0 → return:
  `err('HAS_CHILDREN', 'No se puede desactivar: el empleado tiene N asignaciones activas. Reasigná o registrá la devolución de los activos primero.')`
- Keep the guard **outside** the transaction (consistent with `deleteEmployeeAction`, which comments "HAS_CHILDREN guard stays BEFORE transaction").
- Note the asymmetry with delete: delete blocks on **any** assignment (`_count.assignments > 0`, including historical RETURNED/TRANSFERRED), while deactivate should block only on **ACTIVE** ones — a returned asset no longer ties the custodian. This is intentional and will be documented in the spec.

**Rationale**: the pattern already exists three functions up; we reuse it for consistency. Scoping to `ACTIVE` is the ERP-correct rule (chain of custody only matters for currently-held assets), and it avoids over-blocking employees whose history is fully closed out.

---

## 4. Risks and tradeoffs

**Tradeoff A — App-layer enforcement vs. DB `NOT NULL` on `Asset.locationId`.**
Chosen: app-layer first. A DB constraint is the strongest guarantee but a `NOT NULL` migration fails outright if historical null rows exist, and we explicitly excluded backfill. Doing app-layer now is reversible, ships without a data-cleanup dependency, and we can add the DB constraint in a follow-up once nulls are remediated. Risk: a future write path that bypasses the Yup validation could still persist a null. Mitigation: centralize the create validation and cover it with tests; flag the DB-constraint follow-up in the spec.

**Risk B — Existing null-location/null-bodega rows become "un-editable".**
If we make location required on *edit* too, opening an old asset with a null location forces the user to set one before saving. This is arguably desirable (it nudges cleanup) but could surprise users. Mitigation: required-on-save is acceptable; the form should pre-flag the missing field rather than erroring only on submit. Confirm exact edit-path behavior in the spec.

**Risk C — Conditional bodega adds a query to the write path.**
`locationHasBodegas` adds one count query per asset/movement create. Negligible cost, but it must run inside the movement `$transaction` to stay consistent under concurrent bodega creation/deletion. Mitigation: single indexed count query; acceptable.

**Risk D — Importer behavior.**
The bulk importer derives location/bodega from row data (`actions.ts:~591`). Making location required must not silently drop import rows. Mitigation: importer should reject (with a row-level error) any row that cannot resolve a location, rather than persisting null. Covered in scope; detailed in spec.

**Risk E — Pre-existing test failures.**
16/370 tests already fail, unrelated to this change. Mitigation: new tests must be green and we must not regress the 354 currently passing; the 16 known failures stay out of scope.

---

## 5. Alternatives considered (no-go)

- **DB `NOT NULL` constraint as the primary fix for Issue 1** — rejected for this change: requires historical backfill we explicitly deferred; a failed migration blocks deploy. Kept as a future follow-up.
- **Static Yup `.required()` for bodega (Issue 2)** — rejected: the requirement is conditional on whether the specific location has bodegas, which Yup cannot know without the live count. A static rule would either over-require (locations with no bodegas) or under-require.
- **Client-only validation** — rejected outright: forms are UX, not a security/integrity boundary. Server actions are the source of truth; any guard must live server-side regardless of form behavior.
- **Auto-returning/transferring assignments on deactivation (Issue 3)** — rejected: silently mutating assignment status hides the custody handoff and produces audit entries that misrepresent what happened. The correct behavior is to block and force an explicit reassignment/return by a human.
- **Blocking deactivation on ANY assignment (mirroring delete exactly)** — rejected: historical RETURNED/TRANSFERRED assignments do not represent current custody; blocking on them would trap employees who have already handed everything back. Scope the guard to `ACTIVE`.
