'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { categoriesColumns } from './columns-categories';
import { buildCategoryFormConfig } from '../forms/category-form.config';
import { useCategories } from '../hooks/use-categories';
import { detectPreset } from '../forms/field-config-presets';
import type { CategoryRow } from '../dto/category.dto';
import type { PageInfo } from '@/shared/types/pagination';

export function CategoriesTablePage({
  initialRows,
  canWrite,
  rowCount,
  pageInfo,
  currentPageSize,
  currentQ,
}: {
  initialRows: CategoryRow[];
  canWrite: boolean;
  rowCount: number;
  pageInfo: PageInfo;
  currentPageSize: number;
  currentQ: string;
}) {
  const [dialogOpen, setDialogOpen] = useState({ createOpen: false, editOpen: false });
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const { pending, create, update, remove } = useCategories();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const formConfig = useMemo(
    () =>
      buildCategoryFormConfig({
        excludeIdForParent: editing?.id,
        prefixLocked: (editing?.assetsCount ?? 0) > 0,
        initialParentLabel: editing?.parentName ?? undefined,
      }),
    [editing],
  );

  const columns: ColumnDef<CategoryRow>[] = [
    ...categoriesColumns,
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) =>
        canWrite ? (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setEditing(row.original);
                setDialogOpen((prev) => ({ ...prev, editOpen: true }));
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                if (confirm(`¿Eliminar "${row.original.name}"?`)) {
                  remove(row.original.id, () => {});
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-hidden">
      <div className="flex flex-col gap-0">
        <h1 className="text-lg font-semibold tracking-tight">Categorías</h1>
        <p className="text-xs text-muted-foreground">Tipos de activos y su configuración</p>
      </div>

      <TablePageToolbar config={{
        search: { value: currentQ, onChange: (q) => updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }), placeholder: 'Buscar por nombre o prefijo...' },
        actions: canWrite ? [
          { label: 'Nueva categoría', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => { setEditing(null); setDialogOpen((prev) => ({ ...prev, createOpen: true })); } },
        ] : undefined,
      }} />

      <div className="flex-1 min-h-0">
        <Show
          when={rowCount > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
              <p>No hay categorías registradas.</p>
            </div>
          }
        >
          <MainDataTable
            columns={columns}
            data={initialRows}
            rowCount={rowCount}
            pageInfo={pageInfo}
            onNextPage={() => updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null })}
            onPrevPage={() => updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null })}
          />
        </Show>
      </div>

      <CrudFormDialog
        open={dialogOpen.createOpen}
        onOpenChange={(o) => setDialogOpen((prev) => ({ ...prev, createOpen: o }))}
        title="Nueva categoría"
        formConfig={formConfig}
        defaultValues={{ fieldConfigTemplate: 'peripheral' }}
        isLoading={pending}
        onSubmit={(data) =>
          create(data as never, () => setDialogOpen((prev) => ({ ...prev, createOpen: false })))
        }
      />

      <CrudFormDialog
        open={dialogOpen.editOpen}
        onOpenChange={(o) => setDialogOpen((prev) => ({ ...prev, editOpen: o }))}
        title={editing ? `Editar ${editing.name}` : 'Editar categoría'}
        subtitle={editing ? `${editing.prefix} · ${editing.assetsCount} activo${editing.assetsCount !== 1 ? 's' : ''}` : undefined}
        formConfig={formConfig}
        defaultValues={
          editing
            ? {
                name: editing.name,
                prefix: editing.prefix,
                prefix_locked: editing.prefix,
                description: editing.description ?? '',
                parentId: editing.parentId ?? '',
                defaultUsefulLife: editing.defaultUsefulLife ?? undefined,
                fieldConfigTemplate: detectPreset(editing.fieldConfig),
              }
            : undefined
        }
        isLoading={pending}
        onSubmit={(data) =>
          editing &&
          update(editing.id, data as never, () => {
            setDialogOpen((prev) => ({ ...prev, editOpen: false }));
            setEditing(null);
          })
        }
      />
    </div>
  );
}
