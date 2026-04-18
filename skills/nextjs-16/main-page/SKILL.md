---
name: nextjs-16/main-page
description: >
  Main page patterns for module list pages in this Next.js 16 ERP frontend.
  Trigger: When creating or modifying a list/table page, columns definition, or the XxxTablePage component.
  Pattern: page.tsx (Server Component shell) → XxxTablePage (Client Component) → hook → actions.
license: Apache-2.0
metadata:
  author: pcarlos
  version: "1.1"
  scope: [root, ui]
  auto_invoke: "Creating or modifying a list/table page, columns definition, XxxTablePage component"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## Page Architecture Decision Tree

```
New module page?           → page.tsx (Server Component, no directive) + XxxTablePage (Client Component)
Need interactive table?    → "use client" in XxxTablePage only
Columns with badge/format? → columns-{module}.tsx
Action column (edit/del)?  → inline in XxxTablePage (NEVER in columns file)
Skeleton during load?      → <Show when={!isLoading} fallback={<TableSkeleton>}>
```

## Critical Rules

```
page.tsx        → Server Component — NO "use client", NO hooks, NO logic
XxxTablePage    → "use client" — all interactivity here
columns file    → "use client" — data display only, NO action column
actions column  → ALWAYS defined inline in XxxTablePage, never in the columns file
dialog close    → ONLY in onSuccess callback of the mutation, never before
```

## File Structure

```
{module}/
├── page.tsx                                       ← Server Component shell
└── presentation/
    ├── components/
    │   ├── {Module}TablePage.tsx                  ← Client Component (full CRUD logic)
    │   └── columns-{module}.tsx                   ← "use client" column definitions
    ├── forms/
    │   └── {module}-form.config.ts
    └── hooks/
        └── use-{module}s.ts
```

---

## Layer 1 — page.tsx (Server Component)

Thin shell. Only renders a title, description, and the main component. No logic.

```tsx
import { CountriesTablePage } from "./presentation/components/CountriesTablePage";

export default function CountryPage() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Países</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de países para la organización, asignación de clientes y
          optimización de rutas
        </p>
      </div>
      <CountriesTablePage />
    </div>
  );
}
```

Rules:
- No `"use client"` directive.
- No imports of hooks, queries, or state.
- Fixed container classes: `flex h-full flex-col gap-6 p-6`.
- Title in `<h1>`, description in `<p className="text-sm text-muted-foreground">`.

---

## Layer 2 — columns-{module}.tsx

Defines `ColumnDef<T>[]` for TanStack Table. Client Component. Data display only.

```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { Country } from "../../domain/entities/country.entity";

export const columnsCountries: ColumnDef<Country>[] = [
  {
    accessorKey: "iso_code",
    header: "Código ISO",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("iso_code")}</span>
    ),
  },
  {
    accessorKey: "name",
    header: "Nombre",
  },
  {
    accessorKey: "phone_code",
    header: "Código Tel.",
  },
  {
    accessorKey: "currency_code",
    header: "Moneda",
  },
  {
    accessorKey: "is_active",
    header: "Estado",
    cell: ({ row }) => {
      const active = row.getValue("is_active") as boolean;
      return (
        <Badge variant={active ? "success" : "destructive"}>
          {active ? "Activo" : "Inactivo"}
        </Badge>
      );
    },
  },
];
```

Column rules:
- Plain text fields: only `accessorKey` + `header` — no custom `cell`.
- Boolean fields: `<Badge variant="success" | "destructive">`.
- Monetary/numeric fields: format in `cell`.
- The actions column (Edit / Delete) is NEVER defined here — it goes in `XxxTablePage`.

---

## Layer 3 — {Module}TablePage.tsx (Client Component)

Orchestrates data, dialogs, mutations, and the table. Full CRUD interaction lives here.

```tsx
"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Filter, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MainDataTable } from "@/components/tables/MainTable";
import { Show } from "@/components/show/Show.component";
import { TableSkeleton } from "@/components/tables/TableSkeleton";
import { CrudFormDialog } from "@/shared/presentation/components/form-builder/CrudFormDialog";
import { ExcelImportDialog } from "@/components/import/excel-import-dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useCountries } from "../hooks/use-countrys";
import { columnsCountries } from "./columns-country";
import { countryFormConfig } from "../forms/country-form.config";
import type { Country } from "../../domain/entities/country.entity";

export function CountriesTablePage() {
  // 1. Hook — data and mutations
  const {
    data,
    isLoading,
    pagination,
    setPagination,
    createMutation,
    updateMutation,
    deleteMutation,
  } = useCountries();

  // 2. Local state — only dialogs and the item being edited
  const [dialogOpen, setDialogOpen] = useState({
    importOpen: false,
    editOpen: false,
  });
  const [editingItem, setEditingItem] = useState<Country | null>(null);

  // 3. PageHeader config (module-specific variable name)
  const countryHeader = {
    filters: [
      {
        title: "Filtros",
        icon: <Filter className="mr-1.5 h-3.5 w-3.5" />,
        onClick: () => {},
      },
    ],
    import: [
      {
        title: "Importar Excel",
        icon: <Upload className="mr-1.5 h-3.5 w-3.5" />,
        onClick: () => setDialogOpen((prev) => ({ ...prev, importOpen: true })),
      },
      {
        title: "Crear",
        icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
        onClick: () => handleCreate(),
      },
    ],
  };

  // 4. Handlers
  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen((prev) => ({ ...prev, editOpen: true }));
  };

  const handleEdit = (item: Country) => {
    setEditingItem(item);
    setDialogOpen((prev) => ({ ...prev, editOpen: true }));
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleSubmit = (formData: Record<string, unknown>) => {
    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem.id, data: formData },
        { onSuccess: () => setDialogOpen((prev) => ({ ...prev, editOpen: false })) },
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: () => setDialogOpen((prev) => ({ ...prev, editOpen: false })),
      });
    }
  };

  // 5. Actions column added inline here (never in columns file)
  const columnsWithActions = [
    ...columnsCountries,
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }: { row: { original: Country } }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // 6. Render
  return (
    <>
      <PageHeader pageHeader={countryHeader} />

      <Show
        when={!isLoading}
        fallback={<TableSkeleton columns={columnsCountries.length} />}
      >
        <MainDataTable
          columns={columnsWithActions}
          data={data?.data}
          pageCount={data?.pageCount}
          rowCount={data?.rowCount}
          isLoading={isLoading}
          onPaginationChange={setPagination}
          paginationState={data?.pageInfo ?? { limit: pagination.limit }}
        />
      </Show>

      <CrudFormDialog
        open={dialogOpen.editOpen}
        onOpenChange={(open) => setDialogOpen((prev) => ({ ...prev, editOpen: open }))}
        title={editingItem ? "Editar País" : "Crear País"}
        formConfig={countryFormConfig}
        defaultValues={
          editingItem ? (editingItem as unknown as Record<string, unknown>) : undefined
        }
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ExcelImportDialog
        open={dialogOpen.importOpen}
        onOpenChange={(open) => setDialogOpen((prev) => ({ ...prev, importOpen: open }))}
        moduleKey="country"
        title="Importar Países desde Excel"
        rute="country"
        onSuccess={() => {}}
      />
    </>
  );
}
```

---

## Shared Components — Quick Reference

| Component | Import | Purpose |
|-----------|--------|---------|
| `PageHeader` | `@/components/dashboard/PageHeader` | Header with filter/import/create action buttons |
| `MainDataTable` | `@/components/tables/MainTable` | Paginated TanStack Table |
| `TableSkeleton` | `@/components/tables/TableSkeleton` | Loading skeleton (pass `columns` count) |
| `Show` | `@/components/show/Show.component` | Conditional render with fallback |
| `CrudFormDialog` | `@/shared/presentation/components/form-builder/CrudFormDialog` | Create/edit dialog with FormConfig |
| `ExcelImportDialog` | `@/components/import/excel-import-dialog` | Bulk Excel import dialog |
| `Badge` | `@/components/ui/badge` | Status badges (`variant: "success" \| "destructive"`) |
| `Button` | `@/components/ui/button` | Buttons (`variant: "ghost"`, `size: "icon"`) |

---

## Dialog State Pattern

Always use a single state object for all dialogs in the component.

```typescript
// ✅ Single object — correct
const [dialogOpen, setDialogOpen] = useState({
  importOpen: false,
  editOpen: false,
});

// Update one dialog without affecting others
setDialogOpen((prev) => ({ ...prev, editOpen: true }));
```

```typescript
// ❌ Separate states — incorrect
const [editOpen, setEditOpen] = useState(false);
const [importOpen, setImportOpen] = useState(false);
```

---

## MainDataTable Props

| Prop | Source | Notes |
|------|--------|-------|
| `columns` | `columnsWithActions` | Columns array including the actions column |
| `data` | `data?.data` | The `T[]` array from `PaginatedResponse` |
| `pageCount` | `data?.pageCount` | Total page count |
| `rowCount` | `data?.rowCount` | Total row count |
| `isLoading` | from hook | Controls internal loading state |
| `onPaginationChange` | `setPagination` | Pagination state updater from hook |
| `paginationState` | `data?.pageInfo ?? { limit: pagination.limit }` | Current cursor info |

---

## Rules

1. `page.tsx` is a Server Component — no `"use client"`, no hooks, no logic.
2. `XxxTablePage.tsx` is a Client Component (`"use client"`) — all interactivity goes here.
3. The actions column (Edit/Delete) is always added inline in `XxxTablePage`, never in `columns-{module}.tsx`.
4. Use `<Show>` with `<TableSkeleton>` while `isLoading` is `true`.
5. Create and edit share the same `CrudFormDialog` — differentiated by `editingItem !== null`.
6. Close the dialog only in the `onSuccess` callback of the mutation, not before.
7. `ExcelImportDialog` is only included if the module has bulk import configured in `ms-import-service`.
8. The PageHeader config variable name is module-specific (e.g., `countryHeader`, `currencyHeader`) — not a generic `pageHeader`.
9. All user-facing strings (titles, labels, button text) must be in Spanish.
