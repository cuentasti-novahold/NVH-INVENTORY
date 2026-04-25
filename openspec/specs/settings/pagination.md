# Delta Spec: settings-pagination

**Change**: settings-pagination  
**Modules**: settings/categories · settings/users · settings/locations  
**Pattern**: URL-driven server-side pagination (skill: nextjs-16/pagination-filters)

---

## Scope

### What changes
- All 6 settings table pages gain URL-driven, server-side pagination.
- `listCategoriesAction`, `listUsersAction` (new), and all 4 locations list actions receive `page` + `pageSize` params and return `{rows, rowCount, pageCount}`.
- `page.tsx` for categories and users reads `searchParams`; locations `page.tsx` also reads per-tab pagination params.
- All affected Client Components gain `updateParams` + `onPaginationChange`.

### What does NOT change
- Filter UI (search inputs, dropdowns) — behavior and placement unchanged.
- Column definitions and sorting — no changes to columns files.
- Database schema — no migrations.
- Auth middleware — no changes.
- All non-list Server Actions (create, update, delete, updateUserRole) — signatures unchanged.
- Tab switching logic in `LocationsTabs` — `updateParams({ tab: newTab })` only, never resets full URL.

---

## Interface Contracts

### Shared pagination types

```typescript
interface PaginationParams {
  page: number;      // 1-based; default 1; min 1
  pageSize: number;  // default 20; min 5; max 100
}

interface PaginatedResult<T> {
  rows: T[];
  rowCount: number;
  pageCount: number;
}
```

### listCategoriesAction

```typescript
interface ListCategoriesParams extends PaginationParams {
  q?: string;
}
type ListCategoriesResult = ActionResult<PaginatedResult<CategoryRow>>;
```

### listUsersAction (new)

```typescript
interface ListUsersParams extends PaginationParams {}
type ListUsersResult = ActionResult<PaginatedResult<UserRow>>;
// Auth: caller MUST have SUPER_ADMIN role
```

### Locations actions (4)

```typescript
interface ListLocationParams extends PaginationParams {}
// Applied to: listCountriesAction, listCitiesAction,
//             listLocationsAction, listBodegasAction
// Each returns ActionResult<PaginatedResult<XxxRow>>
```

### URL param naming — locations (tab-scoped)

| Tab key     | Page param        | PageSize param        |
|-------------|-------------------|-----------------------|
| `paises`    | `paises_page`     | `paises_pageSize`     |
| `ciudades`  | `ciudades_page`   | `ciudades_pageSize`   |
| `sedes`     | `sedes_page`      | `sedes_pageSize`      |
| `bodegas`   | `bodegas_page`    | `bodegas_pageSize`    |

---

## Module: settings/categories

### Requirement: Server-side paginated category list

The `listCategoriesAction` Server Action MUST accept `ListCategoriesParams` and return `PaginatedResult<CategoryRow>`. It MUST use `prisma.$transaction([findMany, count])` with `skip = (page - 1) * pageSize` and `take = pageSize`, ordered by `createdAt desc`.

`page.tsx` MUST be a Server Component that reads `searchParams` (awaited Promise), parses `page` (default 1) and `pageSize` (default 20), calls `listCategoriesAction`, and passes `rows`, `rowCount`, `pageCount`, `currentPage`, `currentPageSize` to `CategoriesTablePage`.

`CategoriesTablePage` MUST call `useRouter`/`usePathname`/`useSearchParams` to build an `updateParams` function, wire `onPaginationChange` to `MainDataTable`, and call `router.replace` (not `push`) on every page or size change.

A filter change (q input) MUST reset `page` to 1 in the same `updateParams` call.

#### Scenario: First page load (no URL params)

- GIVEN the user navigates to `/settings/categories` with no query params
- WHEN `page.tsx` renders
- THEN `listCategoriesAction({ page: 1, pageSize: 20 })` is called
- AND `CategoriesTablePage` renders rows 1–20 with correct `pageCount`

#### Scenario: Navigate to next page

- GIVEN the user is on page 1 of categories
- WHEN the user clicks the "next page" control in `MainDataTable`
- THEN `updateParams({ page: 2 })` is called
- AND the URL becomes `?page=2`
- AND `page.tsx` re-renders with `listCategoriesAction({ page: 2, pageSize: 20 })`

#### Scenario: Filter resets page

- GIVEN the user is on page 3 with filter `q=Laptop`
- WHEN the user clears or changes the filter value
- THEN `updateParams({ q: newValue, page: 1 })` is called
- AND the URL shows `page=1`

#### Scenario: Empty result

- GIVEN `listCategoriesAction` returns `rowCount: 0`
- WHEN `CategoriesTablePage` renders
- THEN `MainDataTable` renders an empty-state message
- AND `pageCount` is `0` or `1` (no crash)

---

## Module: settings/users

### Requirement: listUsersAction creation and wiring

`listUsersAction` MUST be created in `settings/users/actions.ts`. It MUST accept `ListUsersParams`, verify the caller has SUPER_ADMIN role (same guard as `updateUserRoleAction`), and return `ActionResult<PaginatedResult<UserRow>>`. It MUST use `prisma.$transaction([findMany, count])` ordered by `createdAt desc`.

`page.tsx` MUST be updated to: (a) accept `searchParams` as an awaited prop, (b) parse `page` and `pageSize`, (c) call `listUsersAction` instead of querying Prisma directly.

`UsersTablePage` MUST receive `rowCount`, `pageCount`, `currentPage`, `currentPageSize` as props and wire `updateParams` + `onPaginationChange` to `MainDataTable`.

#### Scenario: First page load

- GIVEN `/settings/users` with no params and caller is SUPER_ADMIN
- WHEN `page.tsx` renders
- THEN `listUsersAction({ page: 1, pageSize: 20 })` is called
- AND the first 20 users are displayed

#### Scenario: Navigate to page 2

- GIVEN 35 users exist and the user is on page 1
- WHEN the user clicks next page
- THEN URL becomes `?page=2`
- AND `listUsersAction({ page: 2, pageSize: 20 })` returns the remaining 15 users

#### Scenario: Non-SUPER_ADMIN blocked

- GIVEN the caller does not have SUPER_ADMIN role
- WHEN `listUsersAction` is invoked
- THEN it returns `{ ok: false, error: "Forbidden" }` (no data)

#### Scenario: Empty user list

- GIVEN no users exist in the database
- WHEN `listUsersAction({ page: 1, pageSize: 20 })` is called
- THEN it returns `{ rows: [], rowCount: 0, pageCount: 0 }`
- AND `UsersTablePage` renders the empty state without errors

---

## Module: settings/locations

### Requirement: Tab-scoped URL-driven pagination for all 4 sub-tables

All four locations list actions (listCountriesAction, listCitiesAction, listLocationsAction, listBodegasAction) MUST accept `ListLocationParams` and return `ActionResult<PaginatedResult<XxxRow>>`. Each MUST use `prisma.$transaction([findMany, count])` ordered by `createdAt desc`.

`locations/page.tsx` MUST parse per-tab pagination params using the naming convention `{tab}_page` and `{tab}_pageSize` for all four tabs, defaulting to `page: 1, pageSize: 20` when absent. It MUST call each tab's list action independently and pass per-tab `rows`, `rowCount`, `pageCount`, `currentPage`, `currentPageSize` to `LocationsTabs`.

`LocationsTabs` MUST forward pagination props to each sub-component.

Each sub-component (CountriesTablePage, CitiesTablePage, LocationsTablePage, BodegasTablePage) MUST implement `updateParams` scoped to its own prefix (e.g. `paises_page`) and wire `onPaginationChange` to its `MainDataTable`. It MUST NOT modify params belonging to other tabs.

Tab switching MUST call `updateParams({ tab: newTab })` only — it MUST NOT reset pagination params of any tab.

#### Scenario: First page load (paises tab)

- GIVEN `/settings/locations?tab=paises` with no pagination params
- WHEN `page.tsx` renders
- THEN `listCountriesAction({ page: 1, pageSize: 20 })` is called
- AND `CountriesTablePage` shows rows 1–20

#### Scenario: Paginate within a tab

- GIVEN the user is on `?tab=ciudades&ciudades_page=1`
- WHEN the user clicks next page in the cities table
- THEN `updateParams({ ciudades_page: 2 })` is called
- AND the URL becomes `?tab=ciudades&ciudades_page=2`
- AND `listCitiesAction({ page: 2, pageSize: 20 })` is called

#### Scenario: Tab switch preserves other tab pagination

- GIVEN the URL is `?tab=ciudades&ciudades_page=3&paises_page=2`
- WHEN the user switches to the paises tab
- THEN `updateParams({ tab: 'paises' })` is called
- AND the URL becomes `?tab=paises&ciudades_page=3&paises_page=2`
- AND paises data loads for page 2 (preserved)

#### Scenario: PageSize change within bodegas

- GIVEN the user is on `?tab=bodegas&bodegas_page=2`
- WHEN the user changes page size to 50
- THEN `updateParams({ bodegas_page: 1, bodegas_pageSize: 50 })` is called
- AND URL reflects the new size and resets to page 1 for bodegas only

#### Scenario: Empty sub-table

- GIVEN `listBodegasAction` returns `rowCount: 0`
- WHEN `BodegasTablePage` renders
- THEN `MainDataTable` renders the empty state without errors
- AND `pageCount` is `0` or `1`

---

## Constraints (all modules)

| Constraint | Rule |
|------------|------|
| `page` param | 1-based integer; default `1`; values below 1 clamp to `1` |
| `pageSize` param | default `20`; min `5`; max `100`; out-of-range values clamp |
| `orderBy` | `createdAt: 'desc'` for all 6 actions |
| Router method | `router.replace` (not `push`) — no extra history entries |
| `listUsersAction` auth | SUPER_ADMIN only |
| Prisma query | `$transaction([findMany({skip,take,orderBy}), count({where})])` |
| `skip` formula | `(page - 1) * pageSize` |
