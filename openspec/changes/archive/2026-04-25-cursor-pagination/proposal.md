# Proposal: cursor-pagination

**Change**: `cursor-pagination`
**Project**: `nvh-inventory`
**Status**: proposal

---

## Intent

All ERP list pages currently use offset-based pagination (`skip/take`, URL params `page`/`pageSize`, "Pág. X/Y" display). This pattern has a fundamental correctness problem: when records are inserted or deleted between page navigations, items shift — users can see duplicates or miss records. Cursor-based pagination, anchored on `(createdAt, id)`, eliminates this: every page boundary is a stable record, not a row offset.

Additionally, the current `MainDataTable` exposes offset internals (`pageCount`, `onPaginationChange`, TanStack `PaginationState`) to every caller — a leaky abstraction. The cursor interface (`pageInfo: PageInfo`, `onNextPage`, `onPrevPage`) is simpler, more correct, and already documented in `skills/nextjs-16/pagination-filters/SKILL.md` (v2.0).

---

## Scope

### What changes

1. **Shared type** — new `src/shared/types/pagination.ts` with `PageInfo` interface
2. **`MainDataTable`** — redesign: remove `pageCount`/`onPaginationChange`/`paginationState`; add `pageInfo: PageInfo`, `onNextPage`, `onPrevPage`; footer renders `← →` only (no page numbers)
3. **10 Server Actions** — rewrite `listXxxAction` with cursor WHERE pattern:
   - `listAssetsAction` (assets, has `isActive` + `q` filters)
   - `listEmployeesAction` (employees, has `isActive` + `q` filters)
   - `listAssignmentsAction` (assignments, has `status` + `q` filters)
   - `listMovementsAction` (movimientos, has `movementType` + `assetId` filters)
   - `listCategoriesAction` (settings/categories, has `q` filter)
   - `listUsersAction` (settings/users, SUPER_ADMIN only, no extra filters)
   - `listCountriesAction` (settings/locations)
   - `listCitiesAction` (settings/locations)
   - `listLocationsAction` (settings/locations)
   - `listBodegasAction` (settings/locations)
4. **10 page.tsx files** — replace `page`/`pageSize` URL params with `afterCursor`/`beforeCursor`/`pageSize`
5. **~12 TablePage components** — replace `onPaginationChange` + `pageCount` with `onNextPage` + `onPrevPage` + `pageInfo`
6. **locations tabs** — keep `{tab}_` prefix for all 4 location sub-tables; params become `paises_afterCursor`, `paises_pageSize`, etc.

### What does NOT change

- All create/update/delete/import/export actions — untouched
- Auth guards and permission checks — untouched
- All filter logic (isActive, q, status, movementType, assetId) — kept, adapted to cursor WHERE
- All existing search/autocomplete actions — untouched
- TanStack Table v8 `getCoreRowModel` — kept for display; only pagination state/callbacks change

---

## Approach

Verbatim instantiation of the skill template (`skills/nextjs-16/pagination-filters/SKILL.md` v2.0) across all modules. No shared helper, no new abstractions — each module gets its own `ListXxxParams` / `ListXxxResult` with `pageInfo: PageInfo`.

Cursor strategy:
- Cursor = `id` (cuid) of boundary record — globally unique
- `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` — composite, because `createdAt` alone is not unique
- `take: limit + 1` to detect `hasNextPage` without a second query
- `count({ where: filterWhere })` (no cursor) for "N registros" display
- `beforeCursor` reverses orderBy + result array for backward navigation

---

## Risks

| Risk | Mitigation |
|------|-----------|
| 10 actions + 10 pages + 12 components — large blast radius | Batch by module; TypeScript catches shape mismatches at build |
| Test suite mocks actions — shape change breaks mocks | Update test mocks alongside each action |
| locations tabs: 4 cursors per URL (not 4 pages) — URL gets longer | Acceptable; cursors are ~25 chars each |
| Assets/employees already have `__tests__/actions.test.ts` | Must update mocks; cursor logic is unit-testable |
| `movimientos` uses `listMovementsAction` (not `listMovimientosAction`) | Keep function name; only signature changes |

---

## Estimated impact

~34 file touches: 1 new file, 2 shared rewrites, 10 actions, 10 pages, 12 components
