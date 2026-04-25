# Delta Spec: cursor-pagination

**Change**: `cursor-pagination`
**Project**: `nvh-inventory`
**Status**: spec

---

## Scope

This is a cross-cutting delta. No existing `openspec/specs/` domain files exist for these modules, so each requirement is written as a full new requirement (ADDED).

---

## ADDED Requirements

---

### Requirement: REQ-01 — Shared PageInfo Type

`src/shared/types/pagination.ts` MUST export a `PageInfo` interface with the fields: `hasNextPage: boolean`, `hasPreviousPage: boolean`, `startCursor?: string`, `endCursor?: string`, `limit: number`. All `listXxxAction` results MUST import `PageInfo` from this path.

#### Scenario: Type is importable from shared path

- GIVEN the file `src/shared/types/pagination.ts` exists
- WHEN any Server Action imports `PageInfo`
- THEN TypeScript resolves the import without error from `@/shared/types/pagination`

#### Scenario: Interface shape is complete

- GIVEN `PageInfo` is the declared return type of a `pageInfo` field
- WHEN the action returns `{ hasNextPage: true, hasPreviousPage: false, startCursor: 'abc', endCursor: 'xyz', limit: 20 }`
- THEN TypeScript accepts the object without casting

---

### Requirement: REQ-02 — MainDataTable Cursor Interface

`MainDataTable` MUST accept `pageInfo?: PageInfo`, `onNextPage?: () => void`, `onPrevPage?: () => void`. It MUST NOT require `pageCount`, `onPaginationChange`, or `paginationState` — those props MUST be removed. The footer MUST render a previous button (←) and a next button (→). The previous button MUST be disabled when `!pageInfo.hasPreviousPage`. The next button MUST be disabled when `!pageInfo.hasNextPage`. No page numbers SHALL be displayed.

#### Scenario: Next button disabled on last page

- GIVEN a table rendered with `pageInfo.hasNextPage = false`
- WHEN the user views the table footer
- THEN the → button is disabled and not clickable

#### Scenario: Both buttons enabled mid-page

- GIVEN `pageInfo.hasNextPage = true` and `pageInfo.hasPreviousPage = true`
- WHEN the user views the table footer
- THEN both ← and → buttons are enabled

#### Scenario: Old offset props are absent

- GIVEN a caller component that previously passed `pageCount` or `onPaginationChange`
- WHEN the file is compiled after the rewrite
- THEN TypeScript reports an error for the unknown props (they are removed from the interface)

---

### Requirement: REQ-03 — Cursor WHERE Construction

Each `listXxxAction` MUST build a cursor WHERE clause using the pivot record's `createdAt` fetched from the database. For `afterCursor`, the WHERE MUST select records with `createdAt < pivot.createdAt` OR (`createdAt = pivot.createdAt` AND `id < afterCursor`). For `beforeCursor`, the WHERE MUST select records with `createdAt > pivot.createdAt` OR (`createdAt = pivot.createdAt` AND `id > beforeCursor`). When both cursor WHERE and filter WHERE are non-empty, they MUST be combined with `AND`. When no cursor is present, only `filterWhere` is applied.

#### Scenario: Forward page from known cursor

- GIVEN `afterCursor = "clm123"` and the pivot record has `createdAt = T`
- WHEN `listXxxAction` builds the WHERE
- THEN `findMany` receives `{ OR: [{ createdAt: { lt: T } }, { createdAt: T, id: { lt: "clm123" } }] }`

#### Scenario: Cursor AND filter combined

- GIVEN `afterCursor = "clm123"` and `isActive = "active"`
- WHEN `listXxxAction` merges the WHEREs
- THEN `findMany` receives `{ AND: [cursorWhere, { isActive: true }] }`

#### Scenario: No cursor — only filter applied

- GIVEN no `afterCursor` and no `beforeCursor` and `q = "laptop"`
- WHEN `listXxxAction` builds the WHERE
- THEN `findMany` receives only the filter WHERE (no cursor condition, no AND wrapper)

---

### Requirement: REQ-04 — hasNextPage / hasPreviousPage Detection

Each `listXxxAction` MUST request `take: limit + 1` rows from Prisma. If the result contains more than `limit` rows, `hasNextPage` MUST be `true` for forward queries and the extra row MUST be trimmed before mapping. For `beforeCursor` queries, the order MUST be reversed before returning. `hasPreviousPage` MUST be `true` when `afterCursor` is set; `hasNextPage` MUST be `true` when `beforeCursor` is set (the user came from a next page).

#### Scenario: Extra row triggers hasNextPage

- GIVEN `limit = 20` and Prisma returns 21 rows
- WHEN the action processes the result
- THEN `pageInfo.hasNextPage = true` and `rows.length = 20`

#### Scenario: Fewer rows than limit — no next page

- GIVEN `limit = 20` and Prisma returns 15 rows
- WHEN the action processes the result
- THEN `pageInfo.hasNextPage = false` and `rows.length = 15`

#### Scenario: beforeCursor reversal

- GIVEN `beforeCursor` is set and Prisma returns rows in ascending order `[A, B, C, extra]`
- WHEN the action trims and reverses
- THEN `rows` are returned as `[C, B, A]` (most recent first) and `pageInfo.hasPreviousPage = true`

---

### Requirement: REQ-05 — rowCount Independent of Cursor

Each `listXxxAction` MUST execute a `count({ where: filterWhere })` query (no cursor condition) in the same `$transaction` as `findMany`. The `rowCount` field in the result MUST reflect the total number of records matching active filters, regardless of the current page position.

#### Scenario: rowCount is not affected by cursor position

- GIVEN 150 active assets and `afterCursor` pointing to record 40
- WHEN `listAssetsAction({ isActive: "active", afterCursor })` is called
- THEN `rowCount = 150` (not 110)

#### Scenario: rowCount respects active filters

- GIVEN 150 total assets, 120 active and 30 inactive
- WHEN `listAssetsAction({ isActive: "active" })` is called
- THEN `rowCount = 120`

---

### Requirement: REQ-06 — URL Params Shape (Standard Modules)

All standard paginated pages (assets, employees, assignments, movimientos, categories, users) MUST read `afterCursor`, `beforeCursor`, and `pageSize` from URL `searchParams`. The `page` param MUST NOT be read or written. `afterCursor` and `beforeCursor` MUST NOT both be present simultaneously. When any filter param changes, both `afterCursor` and `beforeCursor` MUST be cleared (set to `null` / deleted from URL). `pageSize` MUST default to 20, with min 5 and max 100.

#### Scenario: First load has no cursor

- GIVEN a user navigates to `/assets` with no query params
- WHEN `page.tsx` parses `searchParams`
- THEN `afterCursor = undefined`, `beforeCursor = undefined`, `pageSize = 20`

#### Scenario: Filter change resets cursors

- GIVEN the URL is `/assets?afterCursor=clm123&isActive=active`
- WHEN the user toggles the filter to `isActive=inactive`
- THEN the router replaces with `/assets?isActive=inactive` (both cursors removed)

#### Scenario: Next-page navigation sets afterCursor

- GIVEN `pageInfo.endCursor = "clm456"`
- WHEN `onNextPage()` is called
- THEN URL becomes `?afterCursor=clm456` and `beforeCursor` is absent

---

### Requirement: REQ-07 — Locations Tab-Scoped Cursor Params

The locations settings page manages 4 sub-tables (países, ciudades, locaciones, bodegas) on tabs in the same URL. Each sub-table MUST use prefixed params: `{tab}_afterCursor`, `{tab}_beforeCursor`, `{tab}_pageSize` where `{tab}` is `paises`, `ciudades`, `locaciones`, or `bodegas`. Navigating one tab's pages MUST NOT affect another tab's cursor state.

#### Scenario: Advancing page on paises tab only

- GIVEN URL is `/settings/locations?tab=paises`
- WHEN `onNextPage()` fires for the países table with `endCursor = "clm789"`
- THEN URL becomes `?tab=paises&paises_afterCursor=clm789`; ciudades, locaciones, bodegas params are unset

#### Scenario: Switching tabs does not reset sibling cursors

- GIVEN URL is `?paises_afterCursor=clm789&ciudades_afterCursor=clmABC`
- WHEN the user switches to the ciudades tab
- THEN `paises_afterCursor=clm789` remains in the URL

#### Scenario: Filter on one tab resets only that tab's cursors

- GIVEN URL is `?paises_afterCursor=clm789&bodegas_afterCursor=clmXYZ`
- WHEN a filter is applied to the bodegas table
- THEN `bodegas_afterCursor` is cleared and `paises_afterCursor=clm789` remains

---

### Requirement: REQ-08 — Existing Filters Preserved

All module-specific filters MUST continue to function after the migration. The following filters MUST remain:

| Module | Filters |
|--------|---------|
| assets | `isActive` (`active`/`inactive`/`all`), `q` (text search) |
| employees | `isActive` (`active`/`inactive`/`all`), `q` (text search) |
| assignments | `status` (enum), `q` (text search) |
| movimientos | `movementType` (enum), `assetId` (UUID) |
| categories | `q` (text search) |
| users | none |
| locations ×4 | none |

Filter params MUST be included in `filterWhere` passed to the `count()` query so `rowCount` remains accurate. The `page` param MUST be absent — it MUST NOT be silently read as a fallback.

#### Scenario: Asset search with text filter

- GIVEN `q = "ThinkPad"` and `isActive = "active"`
- WHEN `listAssetsAction` is called
- THEN `filterWhere` includes both the OR text search condition and `isActive: true`; `rowCount` reflects the filtered total

#### Scenario: Assignments status filter preserved

- GIVEN `status = "ACTIVE"` in URL searchParams
- WHEN the assignments `page.tsx` parses params and calls `listAssignmentsAction`
- THEN `filterWhere.status = "ACTIVE"` is applied to both `findMany` and `count`

#### Scenario: page param is not read

- GIVEN a URL contains `page=3` (legacy bookmark)
- WHEN the page.tsx parses searchParams
- THEN `page` is ignored entirely and pagination starts from the first page (no cursor)

---

## REMOVED Requirements

### Requirement: Offset Pagination (page/pageSize)

(Reason: replaced by cursor-based pagination; `page` param, `pageCount`, `onPaginationChange`, and TanStack `PaginationState` are no longer part of the paginated table contract)
