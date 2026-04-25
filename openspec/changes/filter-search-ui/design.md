# Design: filter-search-ui

**Project**: nvh-inventory · **Phase**: design · **Date**: 2026-04-25

---

## 0. Architectural Summary

Two new presentation primitives — a generic `useDebounce<T>` hook and a `FilterBar` component — paired with a controlled-input pattern where each `XxxTablePage` owns the canonical `q` (URL-driven) and `FilterBar` only owns the *transient* keystroke buffer. Six table pages migrate to the new component and one server action gets a `q` parameter extension. No domain or infrastructure code is touched — this is pure presentation.

---

## 1. Component API — `FilterBar`

**File**: `src/components/dashboard/FilterBar.tsx` · directive `'use client'`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/shared/presentation/hooks/use-debounce';
import { cn } from '@/lib/utils';

export interface FilterBarToggle {
  label: string;
  active: boolean;
  onClick: () => void;
}

export interface FilterBarProps {
  /** Canonical search value (URL `q`). External changes mirror into the input. */
  searchValue: string;
  /** Called with the debounced string. Parent wires to updateParams. */
  onSearchChange: (next: string) => void;
  /** Default: "Buscar..." */
  searchPlaceholder?: string;
  /** Toggle group rendered on the right. Omit for search-only bars. */
  toggles?: FilterBarToggle[];
  /** Hide the search input (e.g. movimientos). Default: true. */
  showSearch?: boolean;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  toggles,
  showSearch = true,
  className,
}: FilterBarProps) {
  const [inputValue, setInputValue] = useState(searchValue);

  // External sync — browser back, programmatic clear
  useEffect(() => {
    setInputValue(searchValue);
  }, [searchValue]);

  const debounced = useDebounce(inputValue, 300);

  // Emit only when debounced differs from canonical (prevents mount/sync emit)
  useEffect(() => {
    if (debounced !== searchValue) onSearchChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const hasToggles = !!toggles && toggles.length > 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        showSearch ? 'justify-between' : 'justify-end',
        className,
      )}
    >
      {showSearch && (
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Buscar"
            className="h-9 pl-8"
          />
        </div>
      )}

      {hasToggles && (
        <div
          role="group"
          aria-label="Filtros"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
        >
          {toggles!.map((t, i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant={t.active ? 'default' : 'ghost'}
              aria-pressed={t.active}
              className={cn(
                'h-7 rounded-md px-3 text-xs',
                !t.active && 'text-muted-foreground hover:text-foreground',
              )}
              onClick={t.onClick}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 2. Hook — `useDebounce`

**File**: `src/shared/presentation/hooks/use-debounce.ts`

```ts
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
```

---

## 3. Internal Flow

```
User keystroke
  → setInputValue(...)         (local state, re-renders only FilterBar)
  → useDebounce(input, 300)    (timer reset on every keystroke)
  → debounced !== searchValue?
      yes → onSearchChange(debounced)
          → parent updateParams({ q, afterCursor: null, beforeCursor: null })
          → router.replace(?q=...)
          → RSC refetch in page.tsx
          → new searchValue prop arrives
          → external-sync effect fires
          → setInputValue(searchValue)  ← no-op; guard prevents re-emit
```

Behavioral contracts:
1. **Mount**: no `onSearchChange` fires (guard prevents it)
2. **External sync**: parent's `searchValue` change mirrors into input without re-emitting
3. **Typing**: only the last `inputValue` after 300ms quiet is emitted
4. **Empty input**: emits `''` → parent's `updateParams` deletes the key → server receives no `q`

---

## 4. Visual Layout

```
┌────────────────────────────────────────────────────────────────┐
│  [🔍 Buscar activo...]          [Activos] [Inactivos] [Todos]  │
└────────────────────────────────────────────────────────────────┘
   flex-1 min-w[200] max-w[320]       shrink-0, pill group h-9
```

| Element | Tailwind |
|---------|----------|
| Outer wrapper | `flex flex-wrap items-center gap-3 justify-between` |
| Search wrapper | `relative min-w-[200px] max-w-[320px] flex-1` |
| Search icon | `pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground` |
| Input | `h-9 pl-8` on shadcn `<Input>` |
| Toggle group | `flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-1` |
| Toggle active | `variant="default" h-7 rounded-md px-3 text-xs` |
| Toggle idle | `variant="ghost" h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground` |

---

## 5. Integration Per Module

### assets — `AssetsTablePage.tsx`
```tsx
<FilterBar
  searchValue={currentQ}
  onSearchChange={(q) => updateParams({ q, afterCursor: null, beforeCursor: null })}
  searchPlaceholder="Buscar por código, marca, modelo..."
  toggles={isActiveOptions.map((opt) => ({
    label: opt.label,
    active: currentIsActive === opt.value,
    onClick: () => updateParams({ isActive: opt.value, afterCursor: null, beforeCursor: null }),
  }))}
/>
// Drop pageHeader.filters — keep only pageHeader.import
```

### employees — `EmployeesTablePage.tsx`
Same pattern. `searchPlaceholder="Buscar por nombre, email..."`. Same `isActiveOptions` toggles.

### assignments — `AssignmentsTablePage.tsx`
Most broken — `currentQ` declared but never rendered, no toggles. Add both:
```tsx
<FilterBar
  searchValue={currentQ}
  onSearchChange={(q) => updateParams({ q, afterCursor: null, beforeCursor: null })}
  searchPlaceholder="Buscar por activo o empleado..."
  toggles={[
    { label: 'Activas',      active: currentStatus === 'ACTIVE',      onClick: () => updateParams({ status: 'ACTIVE',      afterCursor: null, beforeCursor: null }) },
    { label: 'Devueltas',    active: currentStatus === 'RETURNED',    onClick: () => updateParams({ status: 'RETURNED',    afterCursor: null, beforeCursor: null }) },
    { label: 'Transferidas', active: currentStatus === 'TRANSFERRED', onClick: () => updateParams({ status: 'TRANSFERRED', afterCursor: null, beforeCursor: null }) },
    { label: 'Todas',        active: currentStatus === 'all',         onClick: () => updateParams({ status: 'all',         afterCursor: null, beforeCursor: null }) },
  ]}
/>
```
Requires new `currentStatus` prop. `assignments/page.tsx` must read `searchParams.status` and pass it.

### movimientos — `MovimientosTablePage.tsx`
```tsx
<FilterBar
  showSearch={false}
  searchValue=""
  onSearchChange={() => {}}
  toggles={TYPE_FILTERS.map((f) => ({
    label: f.label,
    active: currentType === f.value,
    onClick: () => updateParams({ movementType: f.value === 'all' ? null : f.value, afterCursor: null, beforeCursor: null }),
  }))}
/>
// Drop pageHeader.filters
```

### categories — `CategoriesTablePage.tsx`
Replace manual `<Input>` + `<Button>` + `searchInput` useState with:
```tsx
<FilterBar
  searchValue={currentQ}
  onSearchChange={(q) => updateParams({ q, afterCursor: null, beforeCursor: null })}
  searchPlaceholder="Buscar por nombre o prefijo..."
/>
// Remove local searchInput state entirely
```

### users — `UsersTablePage.tsx`
**SKIPPED** — no filters needed for this module.

---

## 6. Server Action Audit

### `listAssignmentsAction` — extend OR clause
```ts
// Existing (already has q support):
filterWhere.OR = [
  { asset:    { assetCode: { contains: q } } },
  { employee: { fullName:  { contains: q } } },
];

// After this change — add brand + model:
filterWhere.OR = [
  { asset:    { assetCode: { contains: q } } },
  { asset:    { brand:     { contains: q } } },
  { asset:    { model:     { contains: q } } },
  { employee: { fullName:  { contains: q } } },
];
```

### `listMovementsAction` — no change (no text search by design)
### `listUsersAction` — no change (module skipped)

---

## 7. File Changes

| # | File | Action | What |
|---|------|--------|------|
| 1 | `src/shared/presentation/hooks/use-debounce.ts` | CREATE | Generic `useDebounce<T>` |
| 2 | `src/components/dashboard/FilterBar.tsx` | CREATE | New component |
| 3 | `src/components/dashboard/PageHeader.tsx` | MODIFY | `@deprecated` JSDoc on `filters` prop |
| 4 | `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` | MODIFY | Add `<FilterBar>`, drop `pageHeader.filters` |
| 5 | `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` | MODIFY | Add `<FilterBar>`, drop `pageHeader.filters` |
| 6 | `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` | MODIFY | Add `<FilterBar>` with search + status toggles, add `currentStatus` prop |
| 7 | `src/app/(dashboard)/assignments/page.tsx` | MODIFY | Read `searchParams.status`, pass `currentStatus` |
| 8 | `src/app/(dashboard)/assignments/actions.ts` | MODIFY | Extend `filterWhere.OR` with `asset.brand`, `asset.model` |
| 9 | `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` | MODIFY | Replace `pageHeader.filters` with `<FilterBar showSearch={false}>` |
| 10 | `src/app/(dashboard)/settings/categories/presentation/components/CategoriesTablePage.tsx` | MODIFY | Replace manual form with `<FilterBar>`, remove `searchInput` state |

---

## 8. Architecture Decisions

**ADR-1: Extract `FilterBar`, do NOT extend `PageHeader`**
PageHeader already mixes filters + import actions. Adding search would make it a junk drawer. SRP wins. Cost: one extra import per page.

**ADR-2: Shared `useDebounce` in `src/shared/presentation/hooks/`**
Generic hook — self-documents the component, reusable, avoids inline `setTimeout` with subtle cleanup bugs. Cost: one new file.

**ADR-3: Controlled input — parent owns `q`, FilterBar owns the buffer**
`updateParams` and cursor reset already live in parent. Two URL-mutation sites would fight. Controlled is testable and decouples from the router. Cost: parent wires a two-line callback (formulaic, repeats 5 times).

**ADR-4: `router.replace`, not `router.push`**
Every keystroke pushing a history entry would make Back walk character-by-character. `replace` keeps history clean while URLs stay canonical for bookmarks. Matches existing pattern.

**ADR-5: `showSearch` boolean, not a separate `ToggleBar` component**
Visual consistency across all modules is the hard requirement. One opt-out boolean is the minimum variation point. A separate component would need identical wrapper styles duplicated.

**ADR-6: Closed-shape API — no facets, no keyboard shortcuts, no expand animation**
YAGNI. When facets arrive, the component gets redesigned holistically.

---

## 9. Risks / Open Items

| Item | Resolve in |
|------|-----------|
| Verify `Asset.brand` / `Asset.model` are searchable nullable strings in Prisma schema | apply |
| Confirm `assignments/page.tsx` plumbs `searchParams.status` correctly | apply |
| Assignments toggle labels (Activas/Devueltas/Transferidas/Todas) — confirm with product | spec |
| `flex-wrap` mobile layout — visually verify at narrow viewports | verify |
