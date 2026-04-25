# Tasks: settings-pagination

**Change**: settings-pagination
**Total tasks**: 16
**Spec ref**: `sdd/settings-pagination/spec` (engram #158)
**Skill ref**: `skills/nextjs-16/pagination-filters/SKILL.md`

---

## Dependency Graph

```
A-0 → A-1 → A-2 → A-3           (sequential)
B-0 → B-1 → B-2 → B-3           (sequential, parallel with A)
C-0 → C-1 → C-2 → C-3 → C-4    (C-4/C-5/C-6/C-7 parallel after C-3)
                        → C-5
                        → C-6
                        → C-7

A-0 / B-0 / C-0 can all start in parallel.
```

---

## Batch A — categories (5 tasks)

### A-0 · Caller audit — listCategoriesAction
**File**: `src/app/(dashboard)/settings/categories/` (read-only grep)
**What**: Confirm no caller destructures `result.data` as flat `CategoryRow[]`. Confirmed: `use-categories.ts` imports only `createCategoryAction`, `updateCategoryAction`, `deleteCategoryAction`. `page.tsx` queries Prisma directly. Zero callers to update.
**Spec req**: Scope / Caller audit rule
**Parallel**: Start immediately (unblocks A-1)

---

### A-1 · Rewrite listCategoriesAction
**File**: `src/app/(dashboard)/settings/categories/actions.ts`
**What**:
- Add `ListCategoriesParams`: `{ page?: number; pageSize?: number; q?: string }`
- Add `ListCategoriesResult`: `{ rows: CategoryRow[]; rowCount: number; pageCount: number }`
- Replace body: clamp → `q` WHERE on `name.contains` → `prisma.$transaction([category.findMany({where, skip:(page-1)*pageSize, take:pageSize, orderBy:{createdAt:'desc'}, include:INCLUDE}), category.count({where})])` → `ok({ rows: rows.map(toCategoryRow), rowCount, pageCount: Math.max(1, Math.ceil(rowCount/pageSize)) })`
- Change return type to `Promise<ActionResult<ListCategoriesResult>>`
- Remove old `orderBy: { name: 'asc' }` (spec mandates `createdAt desc`)
**Spec req**: Module categories — listCategoriesAction
**Depends on**: A-0

---

### A-2 · Rewrite categories/page.tsx
**File**: `src/app/(dashboard)/settings/categories/page.tsx`
**What**:
- Add `searchParams: Promise<{ page?: string; pageSize?: string; q?: string }>` to function signature
- `await searchParams`, parse+clamp: `page = Math.max(1, Number(sp.page ?? 1) || 1)`, `pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20))`, `q = sp.q?.trim() ?? ''`
- Replace `prisma.category.findMany(...)` with `listCategoriesAction({ page, pageSize, q })`
- Add `if (!result.ok) redirect('/')` guard
- Remove `prisma` import, `toCategoryRow` import (mapping now in action)
- Pass `initialRows={result.data.rows}`, `rowCount={result.data.rowCount}`, `pageCount={result.data.pageCount}`, `currentPage={page}`, `currentPageSize={pageSize}` to `CategoriesTablePage`
**Spec req**: Module categories — page.tsx
**Depends on**: A-1

---

### A-3 · Wire pagination in CategoriesTablePage
**File**: `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx`
**What**:
- Add props: `rowCount: number; pageCount: number; currentPage: number; currentPageSize: number`
- Add hooks: `useRouter`, `usePathname`, `useSearchParams` from `next/navigation`
- Add `updateParams(patch: Record<string, string | number | null>)`: merges patch into `URLSearchParams(searchParams.toString())`, calls `router.replace`
- Update `MainDataTable`: `pageCount={pageCount}`, `rowCount={rowCount}`, `paginationState={{ page: currentPage, limit: currentPageSize }}`, `onPaginationChange={(updater) => { const next = updater({ pageIndex: currentPage - 1, pageSize: currentPageSize }); updateParams({ page: next.pageIndex + 1, pageSize: next.pageSize }); }}`
- Remove hardcoded `pageCount={1}`, `paginationState={{ limit: 20 }}`
- Update `Show` condition: `when={rowCount > 0}`
**Spec req**: Module categories — CategoriesTablePage
**Depends on**: A-2

---

## Batch B — users (4 tasks)

### B-0 · Caller audit — listUsersAction (new action)
**File**: `src/app/(dashboard)/settings/users/` (read-only)
**What**: Confirm `UsersTablePage` receives `users: UserRow[]` flat prop (confirmed). Confirm `page.tsx` queries `prisma.user.findMany` directly (confirmed). No existing callers to update when introducing the new action.
**Spec req**: Scope / Caller audit rule
**Parallel**: Start immediately (unblocks B-1)

---

### B-1 · Create listUsersAction
**File**: `src/app/(dashboard)/settings/users/actions.ts`
**What**:
- Add imports: `ok`, `err`, `ActionResult` from `@/shared/types/action-result`; `hasPermission` from `@/lib/permissions`; `prisma` from `@/lib/prisma`
- Add `ListUsersParams`: `{ page?: number; pageSize?: number }`
- Add `UserRow` type: `{ id: string; name: string | null; email: string; role: UserRole; createdAt: string }`
- Add `listUsersAction(params: ListUsersParams = {})`:
  - `session.user.role !== 'SUPER_ADMIN'` → `err('FORBIDDEN', 'Sin permiso')`
  - Clamp page/pageSize
  - `prisma.$transaction([user.findMany({orderBy:{createdAt:'desc'}, skip, take, select:{id,name,email,role,createdAt}}), user.count()])`
  - Map `createdAt` → `.toISOString()`
  - Return `ok({ rows, rowCount, pageCount })`
- Keep `updateUserRole` unchanged
**Spec req**: Module users — listUsersAction
**Depends on**: B-0

---

### B-2 · Rewrite users/page.tsx
**File**: `src/app/(dashboard)/settings/users/page.tsx`
**What**:
- Add `searchParams: Promise<{ page?: string; pageSize?: string }>` param
- `await searchParams`, parse+clamp page and pageSize
- Import `listUsersAction` from `./actions`
- Replace `prisma.user.findMany(...)` with `listUsersAction({ page, pageSize })`
- Add `if (!result.ok) redirect('/')` guard
- Remove `prisma` import
- Pass `users={result.data.rows}`, `rowCount={result.data.rowCount}`, `pageCount={result.data.pageCount}`, `currentPage={page}`, `currentPageSize={pageSize}` to `UsersTablePage`
**Spec req**: Module users — page.tsx
**Depends on**: B-1

---

### B-3 · Wire pagination in UsersTablePage
**File**: `src/app/(dashboard)/settings/users/presentation/components/UsersTablePage.tsx`
**What**:
- Update props interface: add `rowCount: number; pageCount: number; currentPage: number; currentPageSize: number`
- Add hooks: `useRouter`, `usePathname`, `useSearchParams`
- Add `updateParams` (no prefix — flat params: `page`, `pageSize`)
- Update `MainDataTable`: `pageCount={pageCount}`, `rowCount={rowCount}`, `paginationState={{ page: currentPage, limit: currentPageSize }}`, `onPaginationChange`
- Update `Show` condition: `when={rowCount > 0}`
**Spec req**: Module users — UsersTablePage
**Depends on**: B-2

---

## Batch C — locations (7 tasks)

### C-0 · Caller audit — 4 locations list actions
**File**: `src/app/(dashboard)/settings/locations/` (read-only grep)
**What**: Confirm `listCountriesAction`, `listCitiesAction`, `listLocationsAction`, `listBodegasAction` are not called from any file outside this route (they are not — `page.tsx` uses Prisma directly). Confirm no other module imports these 4 actions. Zero callers to update.
**Spec req**: Scope / Caller audit rule
**Parallel**: Start immediately (unblocks C-1)

---

### C-1 · Rewrite 4 locations list actions
**File**: `src/app/(dashboard)/settings/locations/actions.ts`
**What**: For `listCountriesAction`, `listCitiesAction`, `listLocationsAction`, `listBodegasAction`:
- Add shared `ListLocationParams`: `{ page?: number; pageSize?: number }`
- For each action: clamp → `prisma.$transaction([XxxModel.findMany({orderBy:{createdAt:'desc'}, skip, take, include:...}), XxxModel.count()])` → `ok({ rows: rows.map(toXxxRow), rowCount, pageCount: Math.max(1, Math.ceil(rowCount/pageSize)) })`
- Update each return type: `Promise<ActionResult<{ rows: XxxRow[]; rowCount: number; pageCount: number }>>`
- Remove old `orderBy: { name: 'asc' }` from all 4
- `searchXxxAction` functions: unchanged
**Spec req**: Module locations — 4 list actions
**Depends on**: C-0

---

### C-2 · Rewrite locations/page.tsx
**File**: `src/app/(dashboard)/settings/locations/page.tsx`
**What**:
- Extend searchParams type: `{ tab?: string; paises_page?: string; paises_pageSize?: string; ciudades_page?: string; ciudades_pageSize?: string; sedes_page?: string; sedes_pageSize?: string; bodegas_page?: string; bodegas_pageSize?: string }`
- Add helper `parsePage(v?: string) = Math.max(1, Number(v ?? 1) || 1)` and `parsePageSize(v?: string) = Math.min(100, Math.max(5, Number(v ?? 20) || 20))` inline or as local functions
- Replace `Promise.all([prisma.country.findMany(...), ...])` with `Promise.all([listCountriesAction({page: parsePage(sp.paises_page), pageSize: parsePageSize(sp.paises_pageSize)}), listCitiesAction(...), listLocationsAction(...), listBodegasAction(...)])`
- Guard: if any `!result.ok` → `redirect('/')`
- Remove `prisma` import, remove all 4 mapper imports (`toCountryRow`, `toCityRow`, `toLocationRow`, `toBodegaRow`)
- Pass per-tab bundles to `LocationsTabs`:
  - `countriesBundle={{ rows: countriesResult.data.rows, rowCount: ..., pageCount: ..., currentPage: paisesPage, currentPageSize: paisesPageSize }}`
  - Same for cities, sedes, bodegas
**Spec req**: Module locations — page.tsx
**Depends on**: C-1

---

### C-3 · Update LocationsTabs to forward per-tab bundles
**File**: `src/app/(dashboard)/settings/locations/presentation/components/LocationsTabs.tsx`
**What**:
- Define `TabBundle<T>` type: `{ rows: T[]; rowCount: number; pageCount: number; currentPage: number; currentPageSize: number }`
- Replace flat props `countries: CountryRow[]`, `cities: CityRow[]`, `locations: LocationRow[]`, `bodegas: BodegaRow[]` with:
  - `countriesBundle: TabBundle<CountryRow>`
  - `citiesBundle: TabBundle<CityRow>`
  - `locationsBundle: TabBundle<LocationRow>`
  - `bodegasBundle: TabBundle<BodegaRow>`
- Update 4 `TabsContent` children to spread bundle props:
  - `<CountriesTablePage initialRows={countriesBundle.rows} rowCount={countriesBundle.rowCount} pageCount={countriesBundle.pageCount} currentPage={countriesBundle.currentPage} currentPageSize={countriesBundle.currentPageSize} canWrite={canWrite} />`
- Tab switching `onChange` function: unchanged (only sets `tab` param)
**Spec req**: Module locations — LocationsTabs
**Depends on**: C-2

---

### C-4 · Wire pagination in CountriesTablePage (paramPrefix="paises")
**File**: `src/app/(dashboard)/settings/locations/presentation/components/CountriesTablePage.tsx`
**What**:
- Add props: `rowCount: number; pageCount: number; currentPage: number; currentPageSize: number`
- Add hooks: `useRouter`, `usePathname`, `useSearchParams`
- Add `updateParams`: key = `` `paises_${k}` `` (e.g. `paises_page`, `paises_pageSize`), uses `router.replace`, preserves all other URL params
- Update `MainDataTable`: `pageCount`, `rowCount`, `paginationState={{ page: currentPage, limit: currentPageSize }}`, `onPaginationChange`
- Update `Show` condition: `when={rowCount > 0}`
**Spec req**: Module locations — CountriesTablePage
**Depends on**: C-3
**Parallel**: Yes (C-4/C-5/C-6/C-7 in parallel)

---

### C-5 · Wire pagination in CitiesTablePage (paramPrefix="ciudades")
**File**: `src/app/(dashboard)/settings/locations/presentation/components/CitiesTablePage.tsx`
**What**: Same wiring as C-4, paramPrefix = `"ciudades"` (keys: `ciudades_page`, `ciudades_pageSize`)
**Spec req**: Module locations — CitiesTablePage
**Depends on**: C-3
**Parallel**: Yes

---

### C-6 · Wire pagination in LocationsTablePage (paramPrefix="sedes")
**File**: `src/app/(dashboard)/settings/locations/presentation/components/LocationsTablePage.tsx`
**What**: Same wiring as C-4, paramPrefix = `"sedes"` (keys: `sedes_page`, `sedes_pageSize`)
**Spec req**: Module locations — LocationsTablePage
**Depends on**: C-3
**Parallel**: Yes

---

### C-7 · Wire pagination in BodegasTablePage (paramPrefix="bodegas")
**File**: `src/app/(dashboard)/settings/locations/presentation/components/BodegasTablePage.tsx`
**What**: Same wiring as C-4, paramPrefix = `"bodegas"` (keys: `bodegas_page`, `bodegas_pageSize`)
**Spec req**: Module locations — BodegasTablePage
**Depends on**: C-3
**Parallel**: Yes

---

## Caller Audit Summary (pre-flight findings)

| Caller concern | Finding | Action required |
|---|---|---|
| `listCategoriesAction` callers | `use-categories.ts` imports only create/update/delete. `page.tsx` uses Prisma directly. | None |
| `listUsersAction` callers | Action does not exist yet. `page.tsx` uses Prisma directly. | None |
| `listCountriesAction` callers | `page.tsx` uses Prisma directly. No other importer found. | None |
| `listCitiesAction` callers | Same as countries. | None |
| `listLocationsAction` callers | Same as countries. | None |
| `listBodegasAction` callers | Same as countries. | None |

---

## Files Changed (16 total file-level operations)

| Task | File | Operation |
|---|---|---|
| A-1 | `settings/categories/actions.ts` | Modify |
| A-2 | `settings/categories/page.tsx` | Modify |
| A-3 | `settings/categories/presentation/components/CategoriesTablePage.tsx` | Modify |
| B-1 | `settings/users/actions.ts` | Modify |
| B-2 | `settings/users/page.tsx` | Modify |
| B-3 | `settings/users/presentation/components/UsersTablePage.tsx` | Modify |
| C-1 | `settings/locations/actions.ts` | Modify |
| C-2 | `settings/locations/page.tsx` | Modify |
| C-3 | `settings/locations/presentation/components/LocationsTabs.tsx` | Modify |
| C-4 | `settings/locations/presentation/components/CountriesTablePage.tsx` | Modify |
| C-5 | `settings/locations/presentation/components/CitiesTablePage.tsx` | Modify |
| C-6 | `settings/locations/presentation/components/LocationsTablePage.tsx` | Modify |
| C-7 | `settings/locations/presentation/components/BodegasTablePage.tsx` | Modify |

(A-0, B-0, C-0 are read-only audit tasks — no file modifications)
