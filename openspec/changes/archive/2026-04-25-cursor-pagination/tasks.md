# Tasks: cursor-pagination

**Change**: `cursor-pagination`
**Project**: `nvh-inventory`
**Status**: tasks
**Total tasks**: 36
**Phases**: 3 (Foundation → Standard modules → Locations)

---

## Phase 0 — Foundation
> Must complete before any other task. Provides the shared type and the rewritten MainDataTable that all modules depend on.

- [x] T-00 · [Shared] — `src/shared/types/pagination.ts` — CREATE file; export `PageInfo` interface (`hasNextPage`, `hasPreviousPage`, `startCursor?`, `endCursor?`, `limit`) · **Satisfies**: REQ-01
- [x] T-01 · [MainDataTable] — `src/components/tables/MainTable.tsx` — REWRITE interface: remove `pageCount`/`onPaginationChange`/`paginationState`/`PaginationState`/`ChevronsLeft`/`ChevronsRight`; add `pageInfo?: PageInfo`, `onNextPage?`, `onPrevPage?`; footer shows ← → buttons disabled by `hasPreviousPage`/`hasNextPage` · **Satisfies**: REQ-02

---

## Phase 1 — Standard Modules
> T-00 and T-01 must be complete before starting any task in this phase. Tasks within the same module are sequential (action → page → component → test). Tasks across different modules are parallel.

### Module: assets

- [x] T-10-action · [Assets] — `src/app/(dashboard)/assets/actions.ts` — REWRITE `listAssetsAction`: cursor WHERE from `prisma.asset.findUnique` pivot, composite `orderBy [createdAt desc, id desc]` (reversed for `beforeCursor`), `$transaction([findMany({take:limit+1}), count({where:filterWhere})])`, `hasNextPage`/`hasPreviousPage` detection, trim + reverse, return `pageInfo: PageInfo`; preserve `isActive`+`q` filters · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-08
- [x] T-11-page · [Assets] — `src/app/(dashboard)/assets/page.tsx` — Replace `page`/`pageSize` params with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` (not `pageCount`) to `AssetsTablePage` · **Satisfies**: REQ-06
- [x] T-12-component · [Assets] — `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` — Add `pageInfo: PageInfo` prop; add `onNextPage`/`onPrevPage` handlers using `updateParams`; remove `onPaginationChange`/`pageCount`/`paginationState`; all filter changes call `updateParams` with `afterCursor: null, beforeCursor: null` · **Satisfies**: REQ-06, REQ-08
- [x] T-13-test · [Assets] — `src/app/(dashboard)/assets/__tests__/actions.test.ts` — Add `findUnique` mock to `asset` model block; change `$transaction` mock to return `[rows, count]` array; update `listAssetsAction` test assertions from `pageCount` to `pageInfo.hasNextPage`/`hasPreviousPage` · **Satisfies**: REQ-03, REQ-04

### Module: employees

- [x] T-20-action · [Employees] — `src/app/(dashboard)/employees/actions.ts` — REWRITE `listEmployeesAction`: same cursor pattern as T-10-action; preserve `isActive`+`q` filters · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-08
- [x] T-21-page · [Employees] — `src/app/(dashboard)/employees/page.tsx` — Replace `page`/`pageSize` with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` · **Satisfies**: REQ-06
- [x] T-22-component · [Employees] — `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` — Add `pageInfo`, `onNextPage`, `onPrevPage`; remove offset props; filter changes reset cursors · **Satisfies**: REQ-06, REQ-08
- [x] T-23-test · [Employees] — `src/app/(dashboard)/employees/__tests__/actions.test.ts` — Add `findUnique` mock; update `$transaction` mock shape; update assertions to `pageInfo` · **Satisfies**: REQ-03, REQ-04

### Module: assignments

- [x] T-30-action · [Assignments] — `src/app/(dashboard)/assignments/actions.ts` — REWRITE `listAssignmentsAction`: cursor pattern; preserve `status`+`q` filters · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-08
- [x] T-31-page · [Assignments] — `src/app/(dashboard)/assignments/page.tsx` — Replace `page`/`pageSize` with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` · **Satisfies**: REQ-06
- [x] T-32-component · [Assignments] — `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` — Add `pageInfo`, `onNextPage`, `onPrevPage`; remove offset props; filter changes reset cursors · **Satisfies**: REQ-06, REQ-08
- [x] T-33-test · [Assignments] — `src/app/(dashboard)/assignments/__tests__/actions.test.ts` — Add `findUnique` mock; update `$transaction` mock; update assertions to `pageInfo` · **Satisfies**: REQ-03, REQ-04

### Module: movimientos

- [x] T-40-action · [Movimientos] — `src/app/(dashboard)/movimientos/actions.ts` — REWRITE `listMovementsAction` (keep name): cursor pattern on `prisma.assetMovement`; preserve `movementType`+`assetId` filters; no `isActive` · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-08
- [x] T-41-page · [Movimientos] — `src/app/(dashboard)/movimientos/page.tsx` — Replace `page`/`pageSize` with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` · **Satisfies**: REQ-06
- [x] T-42-component · [Movimientos] — `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` — Add `pageInfo`, `onNextPage`, `onPrevPage`; remove offset props; filter changes reset cursors · **Satisfies**: REQ-06, REQ-08
- [x] T-43-test · [Movimientos] — `src/app/(dashboard)/movimientos/__tests__/actions.test.ts` — Add `findUnique` mock to `assetMovement` model block; update `$transaction` mock to `[rows, count]`; replace `pageCount` assertions with `pageInfo.hasNextPage`; remove `page`/`pageSize` call args · **Satisfies**: REQ-03, REQ-04

### Module: settings/categories

- [x] T-50-action · [Categories] — `src/app/(dashboard)/settings/categories/actions.ts` — REWRITE `listCategoriesAction`: cursor pattern; preserve `q` filter · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-08
- [x] T-51-page · [Categories] — `src/app/(dashboard)/settings/categories/page.tsx` — Replace `page`/`pageSize` with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` · **Satisfies**: REQ-06
- [x] T-52-component · [Categories] — `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx` — Add `pageInfo`, `onNextPage`, `onPrevPage`; remove offset props; filter changes reset cursors · **Satisfies**: REQ-06, REQ-08
- [x] T-53-test · [Categories] — `src/app/(dashboard)/settings/categories/__tests__/actions.test.ts` — Add `findUnique` mock; update `$transaction` mock; update assertions to `pageInfo` · **Satisfies**: REQ-03, REQ-04

### Module: settings/users

- [x] T-60-action · [Users] — `src/app/(dashboard)/settings/users/actions.ts` — REWRITE `listUsersAction`: cursor pattern; no extra filters (SUPER_ADMIN guard stays inline) · **Satisfies**: REQ-03, REQ-04, REQ-05
- [x] T-61-page · [Users] — `src/app/(dashboard)/settings/users/page.tsx` — Replace `page`/`pageSize` with `afterCursor`/`beforeCursor`/`pageSize`; pass `pageInfo` · **Satisfies**: REQ-06
- [x] T-62-component · [Users] — `src/app/(dashboard)/settings/users/presentation/components/UsersTablePage.tsx` — Add `pageInfo`, `onNextPage`, `onPrevPage`; remove offset props · **Satisfies**: REQ-06
> No test file exists for settings/users — skip T-63-test.

---

## Phase 2 — Locations
> All Phase 1 tasks must be complete before starting Phase 2 (LocationsTabs depends on the new `MainDataTable` interface being stable). Tasks within Phase 2 are sequential.

- [x] T-L0 · [Locations] — `src/app/(dashboard)/settings/locations/actions.ts` — REWRITE `listCountriesAction`, `listCitiesAction`, `listLocationsAction`, `listBodegasAction`: cursor pattern for each (separate `findUnique` models: `country`, `city`, `location`, `bodega`); no extra filters; update `ListLocationParams` to `afterCursor?`/`beforeCursor?`/`pageSize?`; update `ListLocationResult<T>` to replace `pageCount` with `pageInfo: PageInfo` · **Satisfies**: REQ-03, REQ-04, REQ-05, REQ-07
- [x] T-L1 · [Locations] — `src/app/(dashboard)/settings/locations/page.tsx` — Replace 4× `{tab}_page` params with `{tab}_afterCursor` + `{tab}_beforeCursor` + `{tab}_pageSize` (tabs: `paises`, `ciudades`, `locaciones`, `bodegas`); pass `pageInfo` per tab bundle · **Satisfies**: REQ-07
- [x] T-L2 · [Locations] — `src/app/(dashboard)/settings/locations/presentation/components/LocationsTabs.tsx` — Redesign `TabBundle<T>`: replace `pageCount`/`page` with `pageInfo: PageInfo`; type the `pageSize` field; propagate `pageInfo` + `pageSize` to each sub-component prop · **Satisfies**: REQ-07
- [x] T-L3 · [Locations/Países] — `src/app/(dashboard)/settings/locations/presentation/components/CountriesTablePage.tsx` — Add `pageInfo: PageInfo`; implement `onNextPage`/`onPrevPage` using scoped `updateParams({ paises_afterCursor, paises_beforeCursor })`; pass to `MainDataTable` · **Satisfies**: REQ-07
- [x] T-L4 · [Locations/Ciudades] — `src/app/(dashboard)/settings/locations/presentation/components/CitiesTablePage.tsx` — Same pattern as T-L3 with `ciudades_` prefix · **Satisfies**: REQ-07
- [x] T-L5 · [Locations/Sedes] — `src/app/(dashboard)/settings/locations/presentation/components/LocationsTablePage.tsx` — Same pattern as T-L3 with `locaciones_` prefix · **Satisfies**: REQ-07
- [x] T-L6 · [Locations/Bodegas] — `src/app/(dashboard)/settings/locations/presentation/components/BodegasTablePage.tsx` — Same pattern as T-L3 with `bodegas_` prefix · **Satisfies**: REQ-07
- [x] T-L7 · [Locations] — `src/app/(dashboard)/settings/locations/__tests__/actions.test.ts` — Add `$transaction` to prisma mock for all 4 models; add `findUnique` to each model mock block; add `listXxxAction` test cases asserting `pageInfo.hasNextPage` shape; do NOT change existing CRUD/search tests · **Satisfies**: REQ-03, REQ-04

---

## Dependency Graph

```
T-00 ──┬──────────────────────────────────────────────── T-01
       │                                                    │
       │  (T-00 + T-01 both done)                          │
       └────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼──────────────────────┐
          │                   │                      │
     [assets]            [employees]           [assignments]
    T-10-action          T-20-action           T-30-action
         │                    │                     │
    T-11-page            T-21-page            T-31-page
         │                    │                     │
    T-12-component       T-22-component       T-32-component
         │                    │                     │
    T-13-test            T-23-test            T-33-test
          \                   |                    /
           \              [movimientos]           /
            \              T-40-action           /
             \                  │               /
              \            T-41-page           /
               \                │              /
                \         T-42-component       /
                 \              │             /
                  \        T-43-test         /
                   \            |           /
                    \    [categories]       /
                     \   T-50-action       /
                      \       │           /
                       \ T-51-page       /
                        \     │         /
                    T-52-component      /
                          │            /
                      T-53-test        /
                          \           /
                           [users]   /
                          T-60-action
                               │
                          T-61-page
                               │
                         T-62-component
                               │
                  (all Phase 1 complete)
                               │
                  ┌────────────▼────────────┐
                  │      Phase 2            │
                  │   T-L0 (4 actions)      │
                  │         │               │
                  │      T-L1 (page)        │
                  │         │               │
                  │      T-L2 (Tabs)        │
                  │         │               │
                  │  ┌──────┼──────┐        │
                  │ T-L3  T-L4  T-L5  T-L6  │
                  │  └──────┴──────┘        │
                  │         │               │
                  │       T-L7 (test)       │
                  └─────────────────────────┘
```

### Parallel opportunities

The six standard modules (assets, employees, assignments, movimientos, categories, users) can be worked **in parallel** once T-00 and T-01 are done. Each module's own tasks (action → page → component → test) are sequential within the module.

T-L3, T-L4, T-L5, T-L6 can be worked **in parallel** once T-L2 is done.

---

## Notes

- `settings/users/__tests__/actions.test.ts` does not exist — no test task for that module.
- `settings/locations/__tests__/actions.test.ts` exists but only covers CRUD/search — T-L7 adds list action test cases without modifying existing tests.
- `movimientos/__tests__/actions.test.ts` exists and currently asserts `pageCount` — T-43-test is mandatory to keep the test suite green.
- The `locaciones` prefix in URL params matches the `sedes` display tab (REQ-07 uses `locaciones` not `sedes` for the tab prefix).
- `listMovementsAction` name is unchanged per design Decision 6.
