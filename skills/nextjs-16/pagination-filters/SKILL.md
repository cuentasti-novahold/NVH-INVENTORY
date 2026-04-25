---
name: nextjs-16/pagination-filters
description: >
  Cursor-based pagination and URL-driven filters for ERP tables.
  Trigger: When implementing paginated lists, adding filter support, wiring
  frontend table pagination to a Server Action, or creating a new paginated module.
  Pattern: URL (afterCursor/beforeCursor) → page.tsx → listXxxAction → Prisma cursor WHERE → XxxTablePage → onNextPage/onPrevPage → router.replace.
license: Apache-2.0
metadata:
  author: pcarlos
  version: "2.0"
  scope: [root, ui, api]
  auto_invoke: "Adding pagination, filters, paginated table, listXxxAction, cursor, hasNextPage, hasPreviousPage"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

## Architecture Overview

```
URL searchParams (?afterCursor=<id>&pageSize=20&filters...)
    ↓
page.tsx (Server Component)
  — await searchParams
  — parse afterCursor / beforeCursor / pageSize / filters
  — call listXxxAction(params)
    ↓
listXxxAction (Server Action — "use server")
  — auth check
  — build Prisma WHERE from cursor + filters
  — prisma.$transaction([findMany({ take: limit+1, where: cursorWhere + filterWhere, orderBy }), count({ where: filterWhere })])
  — detect hasNextPage / hasPreviousPage
  — return ok({ rows, rowCount, pageInfo })
    ↓
XxxTablePage (Client Component — "use client")
  — receives initialRows, rowCount, pageInfo
  — MainDataTable ← pageInfo + onNextPage + onPrevPage
    ↓
onNextPage → updateParams({ afterCursor: pageInfo.endCursor, beforeCursor: null })
onPrevPage → updateParams({ beforeCursor: pageInfo.startCursor, afterCursor: null })
    ↓
Next.js re-renders page.tsx with new searchParams (Server re-render)
```

**Key invariants:**
- Cursor = `id` (cuid) of the boundary record — always unique, stable across inserts
- Composite orderBy: `[{ createdAt: 'desc' }, { id: 'desc' }]` forward; reversed for `beforeCursor`
- `take: limit + 1` to detect `hasNextPage` without a second count query
- Separate `count()` only for "N registros" display — ignores cursor, applies filters only
- Filter params reset cursor: always clear `afterCursor`/`beforeCursor` when a filter changes
- State lives in URL — NOT React state

---

## Critical Rules

```
NEVER  skip/take with page offset — cursor-based only
NEVER  store cursor in useState — URL is the source of truth
NEVER  pass pageCount to MainDataTable — cursor pagination has no total pages
ALWAYS take: limit + 1 in findMany (detect hasNextPage by trimming extra row)
ALWAYS reverse orderBy for beforeCursor queries, then reverse result array
ALWAYS clear both cursors when any filter changes: updateParams({ afterCursor: null, beforeCursor: null, ...filter })
ALWAYS fetch cursorRecord.createdAt inside the same $transaction where possible
ALWAYS composite orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] — createdAt alone is not unique
```

---

## Types

```typescript
// Shared page info — returned by every list action
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;  // id of first row in current page
  endCursor?: string;    // id of last row in current page
  limit: number;
}

// Server Action params — one per module
export interface ListXxxParams {
  pageSize?: number;         // default 20, min 5, max 100
  afterCursor?: string;      // go forward: id of last row on current page
  beforeCursor?: string;     // go backward: id of first row on current page
  // module-specific filters:
  // isActive?: 'active' | 'inactive' | 'all';
  // q?: string;
}

// Server Action result
export interface ListXxxResult {
  rows: XxxRow[];
  rowCount: number;   // total matching rows (filters only, no cursor) — for "N registros"
  pageInfo: PageInfo;
}
```

`ActionResult<T>` from `@/shared/types/action-result.ts` — always use `ok()` / `err()`.

---

## Layer 1 — listXxxAction (Server Action)

```typescript
'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { toXxxRow, xxxInclude } from './presentation/mappers/xxx.mapper';
import type { XxxRow } from './presentation/dto/xxx.dto';
import type { PageInfo } from '@/shared/types/pagination';

type Role = Parameters<typeof hasPermission>[0];

export interface ListXxxParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  isActive?: 'active' | 'inactive' | 'all';
  q?: string;
}

export interface ListXxxResult {
  rows: XxxRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listXxxAction(
  params: ListXxxParams = {},
): Promise<ActionResult<ListXxxResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'xxx', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const isActive = params.isActive ?? 'active';
  const q = params.q?.trim() ?? '';

  // 1. Build filter WHERE (applied to count + cursor query)
  const filterWhere: Record<string, unknown> = {};
  if (isActive === 'active')   filterWhere.isActive = true;
  else if (isActive === 'inactive') filterWhere.isActive = false;
  if (q.length > 0) {
    filterWhere.OR = [
      { name: { contains: q } },
      // add other searchable fields
    ];
  }

  // 2. Build cursor WHERE + orderBy direction
  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.xxx.findUnique({
      where: { id: afterCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { lt: afterCursor } },
        ],
      };
    }
  } else if (beforeCursor) {
    const pivot = await prisma.xxx.findUnique({
      where: { id: beforeCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { gt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { gt: beforeCursor } },
        ],
      };
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]; // reversed for backward nav
    }
  }

  // 3. Merge cursor + filter into final WHERE
  const hasFilter = Object.keys(filterWhere).length > 0;
  const hasCursor = Object.keys(cursorWhere).length > 0;
  const finalWhere = hasFilter && hasCursor
    ? { AND: [cursorWhere, filterWhere] }
    : hasCursor
      ? cursorWhere
      : filterWhere;

  // 4. Parallel: fetch limit+1 rows + total count (filters only, no cursor)
  const [rows, rowCount] = await prisma.$transaction([
    prisma.xxx.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: xxxInclude,
    }),
    prisma.xxx.count({ where: filterWhere }),
  ]);

  // 5. Detect page flags
  const hasExtraRow = rows.length > limit;
  const hasNextPage  = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  // 6. Trim extra row + restore order for beforeCursor
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  // 7. Extract cursors
  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor   = data.length > 0 ? data[data.length - 1].id : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({
    rows: (data as any[]).map(toXxxRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}
```

---

## Layer 2 — page.tsx (Server Component)

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listXxxAction } from './actions';
import { XxxTablePage } from './presentation/components/XxxTablePage';

type Role = Parameters<typeof hasPermission>[0];
type IsActiveParam = 'active' | 'inactive' | 'all';

function parseIsActive(v: string | undefined): IsActiveParam {
  return v === 'all' || v === 'inactive' ? v : 'active';
}

export default async function XxxPage({
  searchParams,
}: {
  searchParams: Promise<{
    afterCursor?: string;
    beforeCursor?: string;
    pageSize?: string;
    isActive?: string;
    q?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'xxx', 'read'))
    redirect('/');

  const sp = await searchParams;
  const pageSize     = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor  = sp.afterCursor  || undefined;
  const beforeCursor = sp.beforeCursor || undefined;
  const isActive     = parseIsActive(sp.isActive);
  const q            = sp.q?.trim() ?? '';

  const result = await listXxxAction({ pageSize, afterCursor, beforeCursor, isActive, q });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'xxx', 'create');

  return (
    <XxxTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      canWrite={canWrite}
      currentPageSize={pageSize}
      currentIsActive={isActive}
      currentQ={q}
    />
  );
}
```

Rules:
- `afterCursor` / `beforeCursor` from URL — never both set simultaneously
- No `page` param — replaced by cursors
- `searchParams` is always a `Promise` in Next.js 16 — always `await`

---

## Layer 3 — XxxTablePage (Client Component)

```tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { PageInfo } from '@/shared/types/pagination';

interface XxxTablePageProps {
  initialRows: XxxRow[];
  rowCount: number;
  pageInfo: PageInfo;
  canWrite: boolean;
  currentPageSize: number;
  currentIsActive: 'active' | 'inactive' | 'all';
  currentQ: string;
}

export function XxxTablePage({
  initialRows,
  rowCount,
  pageInfo,
  canWrite,
  currentPageSize,
  currentIsActive,
}: XxxTablePageProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  // Cursor navigation
  function onNextPage() {
    updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null });
  }

  function onPrevPage() {
    updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null });
  }

  // Filter change — always reset cursors
  function onFilterChange(filter: Record<string, string | null>) {
    updateParams({ ...filter, afterCursor: null, beforeCursor: null });
  }

  return (
    <>
      {/* Filter tabs — reset cursors */}
      <Button onClick={() => onFilterChange({ isActive: 'active' })}>Activos</Button>
      <Button onClick={() => onFilterChange({ isActive: 'inactive' })}>Inactivos</Button>

      <MainDataTable
        columns={columnsWithActions}
        data={initialRows}
        rowCount={rowCount}
        pageInfo={pageInfo}
        onNextPage={onNextPage}
        onPrevPage={onPrevPage}
      />
    </>
  );
}
```

---

## MainDataTable — Cursor-Aware Footer

`MainDataTable` no longer receives `pageCount` or `onPaginationChange`.
New props: `pageInfo: PageInfo`, `onNextPage`, `onPrevPage`.

Footer renders:
```
21 registros          ←  →
                   [prev] [next]
```
- `←` disabled when `!pageInfo.hasPreviousPage`
- `→` disabled when `!pageInfo.hasNextPage`
- No page numbers — cursor pagination has no concept of total pages

```typescript
interface MainDataTableProps<T> {
  columns: ColumnDef<T>[];
  data?: T[];
  rowCount?: number;
  isLoading?: boolean;
  pageInfo?: PageInfo;
  onNextPage?: () => void;
  onPrevPage?: () => void;
}
```

---

## Shared Type — `@/shared/types/pagination.ts`

Create this file once, import everywhere:

```typescript
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
  limit: number;
}
```

---

## Adding Filters

Filters use the same `updateParams` pattern but **always reset cursors**:

```typescript
// Search input
updateParams({ q: searchText, afterCursor: null, beforeCursor: null });

// isActive toggle
updateParams({ isActive: 'inactive', afterCursor: null, beforeCursor: null });

// Clear all filters
updateParams({ q: null, isActive: null, afterCursor: null, beforeCursor: null });
```

---

## Checklist — New Paginated Module

**Server Action**
- [ ] `ListXxxParams` — `pageSize?`, `afterCursor?`, `beforeCursor?`, filters
- [ ] `ListXxxResult` — `rows`, `rowCount`, `pageInfo: PageInfo`
- [ ] `listXxxAction` — auth check → build filterWhere → fetch pivot.createdAt → build cursorWhere → merge → `$transaction([findMany({take:limit+1}), count({where:filterWhere})])` → detect flags → trim → reverse if beforeCursor → extract cursors → `ok()`
- [ ] Composite orderBy: `[{ createdAt: 'desc' }, { id: 'desc' }]` (reversed for beforeCursor)

**page.tsx**
- [ ] `searchParams` typed with `afterCursor?`, `beforeCursor?`, `pageSize?`, filters
- [ ] Parse `afterCursor` / `beforeCursor` as strings (undefined if empty)
- [ ] No `page` param
- [ ] Pass `pageInfo` (not `pageCount`) to Client Component

**XxxTablePage**
- [ ] `onNextPage` → `updateParams({ afterCursor: pageInfo.endCursor, beforeCursor: null })`
- [ ] `onPrevPage` → `updateParams({ beforeCursor: pageInfo.startCursor, afterCursor: null })`
- [ ] Every filter change clears both cursors
- [ ] `MainDataTable` receives `pageInfo` + `onNextPage` + `onPrevPage` (NO `paginationState`, NO `onPaginationChange`, NO `pageCount`)
