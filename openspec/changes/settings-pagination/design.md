# Design — settings-pagination

## 1. Executive summary

Replicate the **assets pagination pattern** across `settings/categories`, `settings/users`, and `settings/locations` (with tab-prefixed URL params for the latter). No shared helper, no new abstractions — each module is a verbatim instantiation of the existing template from `skills/nextjs-16/pagination-filters/SKILL.md`.

---

## 2. Approach per batch

### Batch A — `settings/categories` (3 files)

**Action signature change:**
```ts
// BEFORE
export async function listCategoriesAction(): Promise<ActionResult<CategoryRow[]>>

// AFTER
export interface ListCategoriesParams { page?: number; pageSize?: number }
export interface ListCategoriesResult { rows: CategoryRow[]; rowCount: number; pageCount: number }
export async function listCategoriesAction(
  params: ListCategoriesParams = {},
): Promise<ActionResult<ListCategoriesResult>>
```

Implementation: clamps → `prisma.$transaction([findMany({skip,take,orderBy:{createdAt:'desc'},include}), count()])` → `pageCount = Math.max(1, Math.ceil(rowCount/pageSize))` → `ok({rows,rowCount,pageCount})`.

**page.tsx:**
```ts
export default async function CategoriesPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sp = await searchParams;
  const page     = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const result   = await listCategoriesAction({ page, pageSize });
  if (!result.ok) redirect('/');
  return (
    <CategoriesTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageCount={result.data.pageCount}
      currentPage={page}
      currentPageSize={pageSize}
      canWrite={canWrite}
    />
  );
}
```

**CategoriesTablePage:** add `useRouter/usePathname/useSearchParams`, `updateParams`, wire `MainDataTable` with `paginationState={{page:currentPage,limit:currentPageSize}}` + `onPaginationChange`.

---

### Batch B — `settings/users` (3 files + new action)

```ts
export interface ListUsersParams { page?: number; pageSize?: number }
export interface UserRow { id: string; name: string | null; email: string; role: UserRole; createdAt: string }
export interface ListUsersResult { rows: UserRow[]; rowCount: number; pageCount: number }

export async function listUsersAction(
  params: ListUsersParams = {},
): Promise<ActionResult<ListUsersResult>> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN')
    return err('FORBIDDEN', 'Sin permiso');
  // clamps + $transaction([user.findMany({select,orderBy:{createdAt:'desc'},skip,take}), user.count()])
  // map createdAt.toISOString()
}
```

page.tsx removes `prisma.user.findMany` (DDD violation fix). Same wiring as Batch A.

---

### Batch C — `settings/locations` (7 files)

**Tab-scoped URL params:**
```
paises_page, paises_pageSize
ciudades_page, ciudades_pageSize
sedes_page, sedes_pageSize
bodegas_page, bodegas_pageSize
```

**page.tsx:**
```ts
export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    paises_page?: string;   paises_pageSize?: string;
    ciudades_page?: string; ciudades_pageSize?: string;
    sedes_page?: string;    sedes_pageSize?: string;
    bodegas_page?: string;  bodegas_pageSize?: string;
  }>;
}) {
  const sp = await searchParams;
  const parse = (p?: string, s?: string) => ({
    page:     Math.max(1, Number(p ?? 1) || 1),
    pageSize: Math.min(100, Math.max(5, Number(s ?? 20) || 20)),
  });
  const paises   = parse(sp.paises_page,   sp.paises_pageSize);
  const ciudades = parse(sp.ciudades_page, sp.ciudades_pageSize);
  const sedes    = parse(sp.sedes_page,    sp.sedes_pageSize);
  const bodegas  = parse(sp.bodegas_page,  sp.bodegas_pageSize);

  const [countries, cities, locations, bodegasRes] = await Promise.all([
    listCountriesAction(paises),
    listCitiesAction(ciudades),
    listLocationsAction(sedes),
    listBodegasAction(bodegas),
  ]);
  if (!countries.ok || !cities.ok || !locations.ok || !bodegasRes.ok) redirect('/');

  return (
    <LocationsTabs
      initialTab={initialTab}
      canWrite={canWrite}
      countries={{ ...countries.data, ...paises }}
      cities={{    ...cities.data,    ...ciudades }}
      locations={{ ...locations.data, ...sedes }}
      bodegas={{   ...bodegasRes.data, ...bodegas }}
    />
  );
}
```

**LocationsTabs — pure forwarder:**
```ts
interface TabBundle<TRow> {
  rows: TRow[]; rowCount: number; pageCount: number; page: number; pageSize: number;
}
export function LocationsTabs({ initialTab, canWrite, countries, cities, locations, bodegas }) {
  // tab switch onChange unchanged
  return (
    <Tabs value={initialTab} onValueChange={onChange}>
      <TabsContent value="paises">
        <CountriesTablePage {...countries} paramPrefix="paises" canWrite={canWrite} />
      </TabsContent>
      {/* ciudades / sedes / bodegas mirror */}
    </Tabs>
  );
}
```

**Scoped updateParams (each sub-component):**
```ts
function updateParams(patch: Record<string, string | number | null>) {
  const next = new URLSearchParams(searchParams.toString());
  for (const [k, v] of Object.entries(patch)) {
    const key = `${paramPrefix}_${k}`;
    if (v === null || v === '') next.delete(key);
    else next.set(key, String(v));
  }
  router.replace(`${pathname}?${next.toString()}`);
}
```

---

## 3. Action signature migration

| Action | Before | After |
|---|---|---|
| `listCategoriesAction` | `(): ActionResult<CategoryRow[]>` | `(params?): ActionResult<ListCategoriesResult>` |
| `listUsersAction` | *did not exist* | `(params?): ActionResult<ListUsersResult>` |
| `listCountriesAction` | `(): ActionResult<CountryRow[]>` | `(params?): ActionResult<ListCountriesResult>` |
| `listCitiesAction` | `(): ActionResult<CityRow[]>` | `(params?): ActionResult<ListCitiesResult>` |
| `listLocationsAction` | `(): ActionResult<LocationRow[]>` | `(params?): ActionResult<ListLocationsResult>` |
| `listBodegasAction` | `(): ActionResult<BodegaRow[]>` | `(params?): ActionResult<ListBodegasResult>` |

Untouched: all `search*` autocomplete actions, all create/update/delete actions, `updateUserRole`.

---

## 4. Data flow — locations

```
URL: /settings/locations?tab=ciudades&ciudades_page=2&paises_page=1

LocationsPage (Server Component)
  parse 8 params → 4 bundles
  Promise.all([listCountries, listCities, listLocations, listBodegas])
        ↓
LocationsTabs (Client — pure forwarder)
        ↓
  CountriesTablePage    CitiesTablePage    LocationsTablePage    BodegasTablePage
  prefix=paises         prefix=ciudades    prefix=sedes          prefix=bodegas

  User paginates CitiesTablePage:
    updateParams({page: 3})
    → URLSearchParams.set("ciudades_page", "3")
    → router.replace(pathname + "?" + sp)
    → Next.js re-renders LocationsPage
    → paises_page=1 unchanged in URL → countries data unchanged
```

---

## 5. ADRs

| # | Decision | Why |
|---|----------|-----|
| ADR-1 | No shared `paginatedListAction` helper | Prisma typed `include` doesn't compose through generics; ~90 lines duplicated vs ~50 saved |
| ADR-2 | Per-tab prefix URL params | Bookmarkable, tab-switch preserves position, zero cross-tab collision |
| ADR-3 | All 4 children mount + `Promise.all` | Matches current behavior, no UX regression, small data volumes |
| ADR-4 | `orderBy: { createdAt: 'desc' }` uniformly | ERP-wide consistency (visible change from implicit `name:asc`) |
| ADR-5 | `listUsersAction` SUPER_ADMIN inline guard | Mirrors existing page.tsx guard; `users` resource not in PERMISSIONS |

---

## 6. Risks

| Risk | Mitigation |
|------|-----------|
| Caller of changed action expects flat array | Audit tasks confirm zero callers; TypeScript catches shape mismatch |
| C-2 complexity (8 params + 4 actions + bundles) | Most likely bug source; apply in isolation, verify before C-4/5/6/7 |
| `UserRow` type duplication | Single definition in `users/actions.ts`, imported by `UsersTablePage` |
| `orderBy` switch visible to users | Acceptable for admin reference tables |
| `Promise.all` refetches all 4 tabs on any pagination | Acceptable at current data volume; revisit if bodegas exceeds ~10k rows |
