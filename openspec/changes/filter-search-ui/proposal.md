# Proposal: filter-search-ui

**Project**: nvh-inventory
**Status**: proposed
**Date**: 2026-04-25

---

## 1. Intent

### Problem

Filter and search behavior is **inconsistent and partially broken** across the dashboard's six list modules. The IT admins and technicians who use this ERP daily are not exploring data — they are *locating* specific records (an asset by code, an employee by name, an assignment by ticket). Today the tool fights them:

| Module       | What's broken                                                                        |
| ------------ | ------------------------------------------------------------------------------------ |
| assets       | Search `q` is wired in the Server Action but **no input is rendered**. Dead code.    |
| employees    | Same: `q` accepted server-side, no input in UI.                                      |
| assignments  | `currentQ` prop declared in the component interface but **never rendered**. No status toggle either — the module has zero filters in the UI. |
| categories   | Search exists but requires pressing **Enter** (manual submit). Feels like a 2010 form. |
| movimientos  | Type filter present, no text search at all.                                          |
| users        | No filters whatsoever.                                                               |

This means users either **can't search** (assets, employees, assignments), **must press Enter and reload** (categories), or face six different mental models for the same task across the app.

### Why now

Phase 4 of the PRD (operational features) is rolling and these table pages are the daily entry point for every role from VIEWER to SUPER_ADMIN. Every additional record we ingest makes the missing filters more painful. Fixing the pattern now — before more modules adopt the broken templates — prevents the inconsistency from calcifying.

### User impact / success looks like

- A single, unified filter strip on every list page: search input on the left, status toggles on the right.
- Typing into the search input filters the table **automatically after 300ms** — no Enter, no submit button.
- The dead `q` parameter in `assets`, `employees`, and `assignments` actions becomes a real, usable feature.
- All six modules look and behave the same way. A user who learns one learns all.
- Mental model: the strip feels like a **command bar** — dense, fast, never in the way.

---

## 2. Scope

### In scope

**New shared component**

- `src/components/dashboard/FilterBar.tsx` — single horizontal strip combining a debounced search input and a toggle group. Replaces the filter-rendering responsibility currently inside `PageHeader`.

**New shared hook**

- `src/shared/presentation/hooks/use-debounce.ts` — generic `useDebounce<T>(value, delayMs)` hook returning the debounced value. Used by `FilterBar`.

**Modified shared component**

- `src/components/dashboard/PageHeader.tsx` — keeps the right-side `import` actions block; the `filters` toggle rendering is **moved out** to `FilterBar`. PageHeader becomes a thinner "actions bar". (See Approach §3 for the trade-off considered.)

**Modified table-page components (six)**

- `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` — render `<FilterBar>` with search + status toggle (Activos / Inactivos / Todos).
- `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` — render `<FilterBar>` with search + status toggle.
- `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` — render `<FilterBar>` with search + status toggle (the missing UI).
- `src/app/(dashboard)/movements/presentation/components/MovementsTablePage.tsx` — render `<FilterBar>` with search + type toggle (Todos/Entrada/Salida/Traslado). Adds a search input where there was none.
- `src/app/(dashboard)/categories/presentation/components/CategoriesTablePage.tsx` — replace manual `<Input>`/Enter-submit with `<FilterBar>` (search only, no toggle yet).
- `src/app/(dashboard)/settings/users/presentation/components/UsersTablePage.tsx` — render `<FilterBar>` (search only).

**Server-action verification / extension**

- `listAssignmentsAction` — confirm/extend `q` parameter support (search by employee name, asset code, ticket).
- `listMovementsAction` — add `q` parameter support.
- `listUsersAction` — add `q` parameter support (search by email/name).
- The other three (`listAssetsAction`, `listEmployeesAction`, `listCategoriesAction`) already accept `q`; no server-side change.

### Out of scope

- **Advanced filters / faceted search** (filter by category, by location, by assigned-to, by date range). This proposal is about the *bar* and *text search*, not multi-axis filtering. A follow-up change can add a `<FilterPopover>` slot to `FilterBar` later.
- **Server-side full-text search infrastructure** (MySQL FULLTEXT indexes, MeiliSearch, etc.). Current `q` uses Prisma `contains` — fine for current scale.
- **Saved filters / URL shareability beyond what already works** via `updateParams` / cursor pagination.
- **Mobile-specific layout for the filter bar** (collapsing into a sheet/drawer). Desktop-first; mobile gets the same strip, just narrower.
- **Keyboard shortcuts** (e.g. `/` to focus search, `Esc` to clear). Nice-to-have, not in this change.
- **Empty-state copy redesign** when search returns zero rows. Existing empty states stay.
- **Sort UI** — not a filter concern.

---

## 3. Approach

### Decision: extract a new `FilterBar` component, do NOT extend `PageHeader`

The exploration framed this as a fork: *extend PageHeader or extract new component*. I'm picking **extract**, and here is why.

**Option A — extend PageHeader with a `search` slot**

- Pros: one component, fewer imports per page.
- Cons: `PageHeader` today mixes two responsibilities — filter toggles (left) and import/create actions (right). Adding a *third* concern (text search) inside the same flex row makes the component a junk drawer. The header sits *above* the filter strip in the design direction; conflating them forces every page to either use both or fight the layout.

**Option B — extract `FilterBar` (chosen)**

- Pros:
  - **Single Responsibility**: `PageHeader` = page-level actions (import, create). `FilterBar` = row-filtering UI. Two concerns, two components, two files.
  - **Composable**: pages that don't need filters (e.g. detail pages) keep `PageHeader` only. Pages that don't need actions (rare, but possible) use `FilterBar` only.
  - **Visual independence**: `FilterBar` lives *between* the header and the table. Different vertical band, different component. The DOM mirrors the visual hierarchy.
  - **Cleaner prop API**: `<FilterBar value={q} onValueChange={...} toggles={[...]} />` is self-explanatory. No nested config object.
- Cons: one extra import per page. Acceptable — the existing pages already import `PageHeader`, `MainDataTable`, `TableSkeleton`, `Show`, etc. One more is noise-level.

**Implication for `PageHeader`**: the `filters` array on `PageHeaderConfig` becomes redundant once all six pages migrate. We will mark it `@deprecated` in the JSDoc but keep it functional in this change to avoid a flag-day migration. A follow-up cleanup removes it.

### `FilterBar` API (sketch — formalized in spec phase)

```tsx
interface FilterBarToggle {
  title: string;        // e.g. "Activos", "Entrada"
  active: boolean;
  onClick: () => void;
}

interface FilterBarProps {
  // Search
  searchValue: string;
  onSearchChange: (next: string) => void;  // already-debounced value
  searchPlaceholder?: string;               // default: "Buscar..."

  // Toggles (optional — categories/users won't have any)
  toggles?: FilterBarToggle[];
}
```

Internally `FilterBar` owns a local `inputValue` state, runs it through `useDebounce(inputValue, 300)`, and fires `onSearchChange(debounced)` only when the debounced value changes. The parent component's hook (`useAssets`, `useEmployees`, etc.) receives the debounced value and calls `updateParams({ q, afterCursor: null, beforeCursor: null })` to reset pagination.

### Visual signature

- Single horizontal row, full container width.
- Search input on the left: `<Search />` Lucide icon inside a compact `<Input>` (~`w-64` baseline, `focus:w-80` if we want the expand-on-focus polish — to be confirmed in design phase).
- Toggle group on the right: same pill-style button group `PageHeader` uses today, mirrored.
- All Spanish strings: "Buscar...", "Activos", "Inactivos", "Todos", "Entrada", "Salida", "Traslado".

### Migration order (mechanical, batchable)

1. Build `useDebounce` hook + `FilterBar` component + Storybook-style smoke render in one screen.
2. Migrate `assets` and `employees` (highest user value — they're broken today).
3. Migrate `assignments` (the most-broken module).
4. Migrate `movements` and `categories` (replacing the manual Enter-submit).
5. Migrate `users`.
6. Server-action audit: ensure `q` is plumbed in `listAssignmentsAction`, `listMovementsAction`, `listUsersAction`.

---

## 4. Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| **Debounce + cursor pagination interaction**: typing while on page 3 returns mismatched cursor results. | High | Medium | Always reset `afterCursor`/`beforeCursor` to `null` when `q` changes. Already noted in the approach. Cover this in the spec's behavioral requirements. |
| **`q` parameter not actually wired** in `listAssignmentsAction` / `listMovementsAction` / `listUsersAction` despite our assumption. | Medium | Medium | Audit the three actions during apply. If missing, add a `where: { OR: [...contains queries] }` clause. |
| **Prisma `contains` performance** on large `Asset` / `AuditLog` tables. | Low (current scale) | Low | Out of scope here; flag for future indexing work if pagination feels slow past 10k records. |
| **Double-render flash** when debounce fires and table re-fetches. | Medium | Low | Use the existing `TableSkeleton` while loading; don't blank the table. The action hook already handles this. |
| **PageHeader `filters` deprecation confuses contributors** mid-migration. | Medium | Low | Add JSDoc `@deprecated` note + a one-line comment pointing to `FilterBar`. Remove in a follow-up change after all six pages migrate in this one. |
| **Accessibility regressions** — input without label, toggle group without `aria-pressed`. | Medium | Medium | Spec will require `aria-label="Buscar"` on the input and `aria-pressed` on each toggle. Verified in verify phase. |
| **Empty `q` edge case**: clearing the input should *not* keep filtering on the empty string. | Low | Low | Trim and treat empty string as `undefined` before passing to the server action. Codified in spec. |
| **Mobile layout overflow** — search + toggles in a narrow viewport. | Medium | Low | First pass: `flex-wrap` on the bar so toggles wrap below the input on small screens. A proper mobile sheet is out of scope. |

---

## 5. Open questions (for spec/design phases)

- Search input width: fixed `w-64` or `w-64 focus:w-80` expand-on-focus? (design)
- Should `FilterBar` accept a `right` slot for future faceted-filter triggers, or stay closed-shape until we need it? Lean: stay closed for now (YAGNI).
- For `assignments`, is the toggle Activas/Finalizadas/Todas (status of the assignment) or Activos/Inactivos/Todos (status of the assigned asset)? (spec — needs product confirmation; default to assignment status.)
- Should `categories` and `users` get a status toggle eventually, or are they search-only forever? (out of scope here, but worth noting.)

---

## 6. Next phases recommended

- `sdd-spec` — formal behavioral requirements (debounce timing, empty-string handling, cursor reset, accessibility, Spanish strings).
- `sdd-design` — `FilterBar` component API, visual tokens (spacing, width), interaction states (focus, hover, active toggle).

These two can run in parallel.
