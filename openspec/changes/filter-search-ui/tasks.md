# Tasks: filter-search-ui

## Phase 1 — Foundation (sequential, blocks everything else)

- [x] T-01 — CREATE `src/shared/presentation/hooks/use-debounce.ts` — `useDebounce<T>(value, delayMs): T` via setTimeout+clearTimeout pattern. REQ-02.
- [x] T-02 — CREATE `src/components/dashboard/FilterBar.tsx` — controlled component with local `inputValue` + useDebounce(300); calls `onSearchChange` only after delay and only when value genuinely changes (mount guard); toggles are immediate (no debounce); aria-label="Buscar", aria-pressed, role="group". REQ-01, REQ-03, REQ-04, REQ-06, REQ-10.

## Phase 2 — Standard Modules (T-03 to T-06 can run in parallel, each is independent)

- [x] T-03 — MODIFY `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` — replace `pageHeader.filters` with `<FilterBar searchPlaceholder="Buscar activo..." toggles={[isActiveToggle]}>`; wire `q` from URL params; call `updateParams({ q: ..., afterCursor: null, beforeCursor: null })` on change. REQ-03, REQ-05, REQ-08.
- [x] T-04 — MODIFY `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` — same pattern as T-03 with employee toggle; wire `q` + `updateParams` with cursor reset. REQ-03, REQ-05, REQ-08.
- [x] T-05 — MODIFY `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` — replace `pageHeader.filters` with `<FilterBar showSearch={false} toggles={[typeToggle]}`>; no search debounce needed. REQ-06, REQ-08.
- [x] T-06 — MODIFY `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx` — replace manual `<Input>` + `<Button>` + `searchInput` useState with `<FilterBar>`; remove dead state. REQ-01, REQ-03, REQ-04, REQ-05, REQ-08.

## Phase 3 — Assignments Module (sequential within, after Phase 1)

- [x] T-07 — MODIFY `src/app/(dashboard)/assignments/actions.ts` — extend `filterWhere.OR` clause to include `asset: { brand: { contains: q } }` and `asset: { model: { contains: q } }`. REQ-09.
- [x] T-08 — MODIFY `src/app/(dashboard)/assignments/page.tsx` — read `searchParams.status`, pass `currentStatus` prop to `AssignmentsTablePage`. REQ-08.
- [x] T-09 — MODIFY `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` — add `currentStatus` prop; replace `pageHeader.filters` with `<FilterBar toggles={[Activas, Devueltas, Transferidas, Todas]}`>; wire `q` + cursor reset. REQ-03, REQ-05, REQ-06, REQ-08.

## Phase 4 — Deprecation (last, no blockers)

- [x] T-10 — MODIFY `src/components/dashboard/PageHeader.tsx` — add `/** @deprecated Use FilterBar instead */` JSDoc on the `filters` prop. No functional change. REQ-07.
