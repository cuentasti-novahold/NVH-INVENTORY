# Delta Spec — filter-search-ui

**Change**: Unified `FilterBar` component replacing 6 inconsistent filter/search UIs
**Status**: Draft
**Date**: 2026-04-25

---

## Scope

Affected modules: assets, employees, assignments, movimientos, categories, users
New files: `FilterBar` component, `useDebounce` hook
Modified: `PageHeader.tsx` (deprecation mark), 6 `XxxTablePage.tsx` files, 1 server action (`listAssignmentsAction`)

---

## Requirements

---

### REQ-01 — FilterBar Component Exists

A shared `FilterBar` component MUST exist at `src/components/dashboard/FilterBar.tsx`. It MUST accept an optional controlled text search input and an optional toggle group. It MUST NOT include a submit button — filtering triggers automatically.

#### Scenario: Renders search input when module has q targets

- GIVEN a module with text search support (e.g. assets)
- WHEN `FilterBar` is rendered with `searchPlaceholder` provided
- THEN a visible text input is rendered with `aria-label="Buscar"`

#### Scenario: Renders toggle group when options are provided

- GIVEN a module with status/type options
- WHEN `FilterBar` is rendered with toggle options
- THEN a toggle group is rendered with one button per option
- AND each button carries `aria-pressed="true"` when selected, `aria-pressed="false"` otherwise

#### Scenario: Renders nothing when module has no filters

- GIVEN the users module (no text search, no toggles)
- WHEN `FilterBar` is rendered with no search or toggle props
- THEN neither input nor toggle group is rendered

---

### REQ-02 — useDebounce Hook Exists

A `useDebounce` hook MUST exist at `src/shared/presentation/hooks/use-debounce.ts`. It MUST accept a value and a delay in milliseconds, and return the debounced value.

#### Scenario: Returns initial value immediately

- GIVEN the hook is initialized with value `"laptop"` and delay `300`
- WHEN the component renders for the first time
- THEN the returned debounced value is `"laptop"`

#### Scenario: Does not propagate rapid intermediate keystrokes

- GIVEN a user types `"l"`, `"la"`, `"lap"` within a 300ms window
- WHEN each keystroke updates the raw value
- THEN the debounced value does NOT change until 300ms have elapsed since the last keystroke

#### Scenario: Propagates value after delay elapses

- GIVEN the user stops typing and 300ms elapse
- WHEN no further changes occur
- THEN the debounced value updates to match the raw value

---

### REQ-03 — Text Search Debounced at 300ms

All text search inputs (assets, employees, assignments, categories) MUST apply a 300ms debounce before triggering a data fetch.

#### Scenario: Single keystroke does not trigger immediate fetch

- GIVEN the user is on the assets list
- WHEN the user types one character
- THEN no URL param update occurs within the first 300ms

#### Scenario: Fetch triggered after debounce window

- GIVEN the user types `"MacBook"` and pauses
- WHEN 300ms have elapsed since the last keystroke
- THEN `updateParams` is called with `q: "MacBook"`

#### Scenario: Only the final debounced value is sent

- GIVEN the user types `"Mac"` then `"MacBook"` within 300ms
- WHEN the debounce window closes
- THEN `updateParams` is called once with `q: "MacBook"`, never with `q: "Mac"` alone

---

### REQ-04 — Empty or Whitespace Query Treated as Absent

When the search input is empty or whitespace, no `q` parameter MUST be sent — the full unfiltered list is returned.

#### Scenario: Empty string after clearing input

- GIVEN the user previously searched for `"Dell"` and clears the input
- WHEN the debounce window closes
- THEN `updateParams` is called with `q: null` (deleted from URL)

#### Scenario: Whitespace-only input

- GIVEN the user types three spaces
- WHEN the debounce window closes
- THEN `updateParams` is called with `q: null` and the result is identical to no filter

---

### REQ-05 — Filter Change Resets Pagination Cursors

Any filter change (text search OR toggle) MUST reset `afterCursor` and `beforeCursor` to `null` in the same `updateParams` call.

#### Scenario: Text search resets cursor

- GIVEN the user is on page 3 (non-null `afterCursor`)
- WHEN the user types a search term and the debounce window closes
- THEN `updateParams` is called with `{ q, afterCursor: null, beforeCursor: null }`

#### Scenario: Toggle change resets cursor

- GIVEN the user is on page 2 of active employees
- WHEN the user clicks "Inactivos"
- THEN `updateParams` is called with `{ isActive: 'inactive', afterCursor: null, beforeCursor: null }`

---

### REQ-06 — Toggle Interaction Is Immediate

Toggle selections MUST trigger `updateParams` immediately — no debounce.

#### Scenario: Toggle click fires without delay

- GIVEN the user clicks a toggle option
- WHEN the click event fires
- THEN `updateParams` is called immediately (no 300ms wait)

#### Scenario: Only one toggle is active at a time

- GIVEN "Todos" is selected
- WHEN the user clicks "Activos"
- THEN "Activos" becomes selected and all other options become deselected

---

### REQ-07 — PageHeader Deprecation

The `filters` prop on `PageHeader` MUST be marked `@deprecated` but MUST remain functional.

#### Scenario: Deprecated prop still renders

- GIVEN a page that currently passes `filters` to `PageHeader`
- WHEN rendered after this change
- THEN the filters still appear and no error is thrown

#### Scenario: Updated modules use FilterBar, not PageHeader filters

- GIVEN any of the 6 modules updated in this change
- WHEN the page renders
- THEN filter controls come from `FilterBar`, not `PageHeader.filters`

---

### REQ-08 — Module-Specific Filter Fields

Each module MUST expose exactly the following:

| Module | Text search targets | Toggle group |
|--------|-------------------|--------------|
| assets | assetCode, brand, model, serialNumber, hostname | Activos / Inactivos / Todos |
| employees | fullName, email, position | Activos / Inactivos / Todos |
| assignments | assetCode (via asset), employeeName (via employee) | Activas / Finalizadas / Todas |
| movimientos | none | Todos / Entrada / Salida / Traslado |
| categories | name, prefix | none |
| users | none | none |

#### Scenario: Assets — search matches assetCode

- GIVEN the user searches for `"NVH-PC"`
- WHEN the server action is called with `q: "NVH-PC"`
- THEN results include assets whose `assetCode` contains `"NVH-PC"`

#### Scenario: Assignments — search matches employee name

- GIVEN the user searches for `"Carlos"`
- WHEN `listAssignmentsAction` is called with `q: "Carlos"`
- THEN results include assignments linked to employees whose name contains `"Carlos"`

#### Scenario: Movimientos — no search input rendered

- GIVEN the movimientos list page
- WHEN it renders
- THEN no text search input is visible and the type toggle group is visible

#### Scenario: Users — no FilterBar controls rendered

- GIVEN the users list page
- WHEN it renders
- THEN neither search input nor toggle group is visible

---

### REQ-09 — listAssignmentsAction Adds q Support

`listAssignmentsAction` MUST add a `q` parameter that searches across related asset fields and employee full name. `listMovementsAction` and `listUsersAction` MUST NOT receive text search support in this change.

#### Scenario: listAssignmentsAction accepts q

- GIVEN `listAssignmentsAction({ q: "laptop" })`
- WHEN the action executes
- THEN it returns assignments where the related asset's `assetCode`, `brand`, or `model` contains `"laptop"`, OR the related employee's `fullName` contains `"laptop"`

#### Scenario: listAssignmentsAction with no q returns all

- GIVEN `listAssignmentsAction({ q: undefined })`
- WHEN the action executes
- THEN all assignments are returned without a text filter

---

### REQ-10 — Accessibility

- Search input: `aria-label="Buscar"`
- Toggle buttons: `aria-pressed="true"` when selected, `aria-pressed="false"` otherwise
- Toggle group container: `role="group"` with descriptive `aria-label`
- All user-facing text in Spanish

#### Scenario: Active toggle has aria-pressed true

- GIVEN "Activos" is selected
- WHEN inspected via accessibility tree
- THEN the "Activos" button has `aria-pressed="true"` and all others have `aria-pressed="false"`

---

## Out of Scope

- Advanced filter panels (date ranges, multi-select)
- Saved filter presets
- Removing the deprecated `filters` prop from `PageHeader`
- Changes to sort UI
- Test files (covered in tasks phase)
