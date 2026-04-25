# Design: cursor-pagination

## Technical Approach

Replace every offset-based `listXxxAction` / `page.tsx` / `XxxTablePage` with the cursor pattern defined verbatim in `skills/nextjs-16/pagination-filters/SKILL.md` v2.0. Work proceeds in three phases: (1) foundation — shared type + `MainDataTable` rewrite; (2) standard modules in dependency order; (3) locations tabs, which require an adapted `TabBundle<T>` interface. Each module batch is self-contained and independently shippable.

---

## Architecture Decisions

### Decision 1: Batch order — Foundation → Standard modules → Locations

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Foundation first (PageInfo + MainDataTable) | All downstream callers compile against the new interface immediately; TypeScript catches shape mismatches before the first module lands | **Chosen** |
| Module-by-module with inline type | No upfront shared file; type drifts per module | Rejected |
| Locations first | Most complex (4 cursors); risky to start there | Rejected |

Batch order within standard modules: assets → employees → assignments → movimientos → settings/categories → settings/users → locations. Rationale: assets has the most tests and proves the pattern; locations is last because it requires the `TabBundle<T>` redesign.

### Decision 2: Locations tab cursor params naming

Current offset params: `paises_page`, `paises_pageSize`, `ciudades_page`, etc.

New params keep the `{tab}_` prefix and replace `page` with cursor params:

```
paises_afterCursor   paises_beforeCursor   paises_pageSize
ciudades_afterCursor ciudades_beforeCursor ciudades_pageSize
sedes_afterCursor    sedes_beforeCursor    sedes_pageSize
bodegas_afterCursor  bodegas_beforeCursor  bodegas_pageSize
```

`{tab}_pageSize` survives unchanged. `{tab}_page` is removed entirely.

Rationale: the prefix convention is established and surfaced in the URL (`/settings/locations?tab=ciudades&ciudades_afterCursor=...`). Users and tests can distinguish which tab's cursor is which. Alternatives (`cursor_paises_after`, flat `afterCursor_paises`) were rejected as less consistent with the existing convention.

### Decision 3: TabBundle<T> interface redesign

Current `LocationsTabs.tsx` receives one `TabBundle<TRow>` per tab:
```typescript
interface TabBundle<TRow> {
  rows: TRow[];
  rowCount: number;
  pageCount: number;   // remove
  page: number;        // remove
  pageSize: number;
}
```

New shape:
```typescript
interface TabBundle<TRow> {
  rows: TRow[];
  rowCount: number;
  pageInfo: PageInfo;
  pageSize: number;
}
```

`LocationsTabs` passes `pageInfo` + `onNextPage`/`onPrevPage` callbacks to each `XxxTablePage`. Each sub-table's `onNextPage`/`onPrevPage` calls `updateParams({ paises_afterCursor: ..., paises_beforeCursor: null })` using the appropriate tab prefix. `LocationsPage` (server) parses the 8 cursor params and constructs `TabBundle<T>` from each action result.

### Decision 4: MainDataTable — full interface replacement, no compat shim

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove old props entirely | Clean interface; forces callers to migrate at once; TypeScript errors pinpoint every callsite | **Chosen** |
| Optional compat props with deprecation warning | Allows partial migration; adds dead code and runtime noise | Rejected |

Confirmed: `MainDataTable` is only called from the ~12 `XxxTablePage` components. No external callers in shared layouts or non-list pages. Safe to remove `pageCount`, `onPaginationChange`, and `paginationState` outright.

The `pageCount > 1` footer condition and `ChevronsLeft`/`ChevronsRight` (first/last page) buttons are removed. Footer shows `← →` using `hasPreviousPage` / `hasNextPage`.

`PaginationState` import from `@tanstack/react-table` is removed. `useReactTable` no longer receives `pageCount`, `manualPagination`, or `onPaginationChange`. The table is purely display-layer.

### Decision 5: Test mock updates — co-located with each module's action rewrite

Tests in `__tests__/actions.test.ts` call `listXxxAction` with `{ page, pageSize }` and assert `r.data.pageCount`. After the migration the call signature is `{ afterCursor?, beforeCursor?, pageSize? }` and the result is `{ rows, rowCount, pageInfo }`.

Strategy: update the test file in the same task batch as its module's action. Do NOT leave a test file referencing the old interface after the action has been rewritten — it would fail CI immediately.

Mock updates required:
- `(prisma.$transaction as vi.fn).mockResolvedValue([[baseAsset], 1])` → the new action now calls `prisma.xxx.findUnique` (pivot fetch) separately from the `$transaction`. The mock must handle both calls: `findUnique` (pivot) returns `null` (no cursor on first page), `$transaction` returns `[rows, count]`.
- Assertions `r.data.pageCount` → `r.data.pageInfo.hasNextPage` / `r.data.pageInfo.hasPreviousPage`.

### Decision 6: movimientos action name — keep listMovementsAction

The existing function is `listMovementsAction` in `src/app/(dashboard)/movimientos/actions.ts`. Name does NOT change. Only the params/result shape changes (`page`/`pageSize`/`pageCount` → cursor pattern).

---

## Data Flow

```
URL: ?afterCursor=<id>&pageSize=20&isActive=active&q=lenovo
         │
         ▼
page.tsx (Server Component)
  await searchParams
  → parse afterCursor/beforeCursor/pageSize/filters
  → call listXxxAction(params)
         │
         ▼
listXxxAction (Server Action)
  1. auth + permission check
  2. build filterWhere from filters
  3. if afterCursor: prisma.xxx.findUnique(pivot) → build GT/LT cursorWhere
     if beforeCursor: same, reversed orderBy
  4. prisma.$transaction([
       findMany({ where: AND[cursorWhere, filterWhere], orderBy, take: limit+1 }),
       count({ where: filterWhere })
     ])
  5. detect hasNextPage (extra row), hasPreviousPage (cursor present)
  6. trim extra row, reverse if beforeCursor
  7. return ok({ rows, rowCount, pageInfo })
         │
         ▼
XxxTablePage (Client Component)
  receives: initialRows, rowCount, pageInfo, pageSize, filters
  onNextPage → updateParams({ afterCursor: pageInfo.endCursor, beforeCursor: null })
  onPrevPage → updateParams({ beforeCursor: pageInfo.startCursor, afterCursor: null })
  filter change → updateParams({ ...filter, afterCursor: null, beforeCursor: null })
         │
         ▼
MainDataTable
  columns + data (display only, no pagination state)
  footer: rowCount label | [←] disabled=!hasPreviousPage  [→] disabled=!hasNextPage
```

---

## File Changes

### Phase 1 — Foundation

| File | Action | Description |
|------|--------|-------------|
| `src/shared/types/pagination.ts` | Create | `PageInfo` interface — `hasNextPage`, `hasPreviousPage`, `startCursor?`, `endCursor?`, `limit` |
| `src/components/tables/MainTable.tsx` | Rewrite | Remove `pageCount`, `onPaginationChange`, `paginationState`, `PaginationState` import, `ChevronsLeft/Right`; add `pageInfo?: PageInfo`, `onNextPage?`, `onPrevPage?`; replace TanStack pagination state with simple cursor footer |

### Phase 2 — Standard Modules (one batch per module)

| File | Action | Description |
|------|--------|-------------|
| `src/app/(dashboard)/assets/actions.ts` | Modify | `listAssetsAction`: replace `page`/`pageSize`/`pageCount` with cursor pattern; keep `isActive`/`q`/`categoryId`/`generalStatus`/`locationId` filters |
| `src/app/(dashboard)/assets/page.tsx` | Modify | Parse `afterCursor`/`beforeCursor`; pass `pageInfo` not `pageCount` |
| `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` | Modify | Replace `onPaginationChange`/`pageCount`/`currentPage` with `onNextPage`/`onPrevPage`/`pageInfo` |
| `src/app/(dashboard)/assets/__tests__/actions.test.ts` | Modify | Update `listAssetsAction` mock + assertions to cursor shape |
| `src/app/(dashboard)/employees/actions.ts` | Modify | Same pattern — `isActive`/`q` filters |
| `src/app/(dashboard)/employees/page.tsx` | Modify | Cursor params |
| `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` | Modify | Cursor navigation |
| `src/app/(dashboard)/employees/__tests__/actions.test.ts` | Modify | Update mocks |
| `src/app/(dashboard)/assignments/actions.ts` | Modify | `status`/`q` filters |
| `src/app/(dashboard)/assignments/page.tsx` | Modify | Cursor params |
| `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` | Modify | Cursor navigation |
| `src/app/(dashboard)/assignments/__tests__/actions.test.ts` | Modify | Update mocks |
| `src/app/(dashboard)/movimientos/actions.ts` | Modify | `listMovementsAction` (keep name); `movementType`/`assetId` filters |
| `src/app/(dashboard)/movimientos/page.tsx` | Modify | Cursor params |
| `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` | Modify | Cursor navigation |
| `src/app/(dashboard)/settings/categories/actions.ts` | Modify | `q` filter |
| `src/app/(dashboard)/settings/categories/page.tsx` | Modify | Cursor params |
| `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx` | Modify | Cursor navigation |
| `src/app/(dashboard)/settings/categories/__tests__/actions.test.ts` | Modify | Update mocks |
| `src/app/(dashboard)/settings/users/actions.ts` | Modify | No extra filters; SUPER_ADMIN guard unchanged |
| `src/app/(dashboard)/settings/users/page.tsx` | Modify | Cursor params |
| `src/app/(dashboard)/settings/users/presentation/components/UsersTablePage.tsx` | Modify | Cursor navigation |

### Phase 3 — Locations Tabs

| File | Action | Description |
|------|--------|-------------|
| `src/app/(dashboard)/settings/locations/actions.ts` | Modify | All 4 list actions: `listCountriesAction`, `listCitiesAction`, `listLocationsAction`, `listBodegasAction` — cursor pattern |
| `src/app/(dashboard)/settings/locations/page.tsx` | Modify | Parse 8 cursor params (`{tab}_afterCursor`, `{tab}_beforeCursor`); build `TabBundle<T>` with `pageInfo` |
| `src/app/(dashboard)/settings/locations/presentation/components/LocationsTabs.tsx` | Modify | `TabBundle<T>` → remove `page`/`pageCount`, add `pageInfo: PageInfo`; pass cursor callbacks to sub-tables with tab-prefixed `updateParams` |
| `src/app/(dashboard)/settings/locations/presentation/components/CountriesTablePage.tsx` | Modify | Cursor navigation via `paises_afterCursor`/`paises_beforeCursor` |
| `src/app/(dashboard)/settings/locations/presentation/components/CitiesTablePage.tsx` | Modify | `ciudades_afterCursor`/`ciudades_beforeCursor` |
| `src/app/(dashboard)/settings/locations/presentation/components/LocationsTablePage.tsx` | Modify | `sedes_afterCursor`/`sedes_beforeCursor` |
| `src/app/(dashboard)/settings/locations/presentation/components/BodegasTablePage.tsx` | Modify | `bodegas_afterCursor`/`bodegas_beforeCursor` |

**Total: 1 new file, ~32 modified files**

---

## Interfaces / Contracts

```typescript
// src/shared/types/pagination.ts
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;  // id of first row in current page
  endCursor?: string;    // id of last row in current page
  limit: number;
}

// MainDataTable new props (MainTable.tsx)
interface MainDataTableProps<T> {
  columns: ColumnDef<T>[];
  data?: T[];
  rowCount?: number;
  isLoading?: boolean;
  pageInfo?: PageInfo;
  onNextPage?: () => void;
  onPrevPage?: () => void;
}

// Standard module action result shape
interface ListXxxResult {
  rows: XxxRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

// Locations TabBundle<T> new shape
interface TabBundle<TRow> {
  rows: TRow[];
  rowCount: number;
  pageInfo: PageInfo;
  pageSize: number;
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — list actions | First page (no cursor): `hasNextPage=true` when rows>limit, `hasPreviousPage=false`. Forward nav: pivot mock returns createdAt, cursorWhere filters correctly. Backward nav: reversed orderBy, result array reversed. | Vitest + mocked `prisma` and `prisma.$transaction`. Update existing `__tests__/actions.test.ts` per module. |
| Unit — MainDataTable | Footer disables ← when `!hasPreviousPage`, disables → when `!hasNextPage`. No pageCount rendering. | Existing Vitest setup; add/update component tests if they exist. |
| Integration | Not required — no new DB schema, no migrations. | N/A |
| E2E | Manual smoke: navigate forward and back on /assets, /employees, /settings/locations. | Manual QA checklist. |

---

## Migration / Rollout

No data migration required. No DB schema changes. The migration is purely code — type signature and URL param changes.

Rollout strategy: the `{tab}_page` URL params will silently become no-ops after the migration (Next.js ignores unknown params). Users who bookmarked a specific page will land on page 1 after deploy. This is acceptable — cursor state is session-ephemeral, not persistent.

---

## Open Questions

- [ ] Does `movimientos/page.tsx` currently handle `movementType` and `assetId` as URL params? Confirm param names before Phase 2 batch to avoid a rename.
- [ ] Are there `__tests__/actions.test.ts` files for `movimientos`, `settings/users`, or `settings/locations`? If yes, update in same batch. If not, no test work needed for those modules.
