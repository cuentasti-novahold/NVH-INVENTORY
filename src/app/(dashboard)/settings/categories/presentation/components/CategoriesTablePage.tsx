'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { categoriesColumns } from './columns-categories';
import { buildCategoryFormConfig } from '../forms/category-form.config';
import { useCategories } from '../hooks/use-categories';
import { detectPreset } from '../forms/field-config-presets';
import type { CategoryRow } from '../dto/category.dto';

export function CategoriesTablePage({
  initialRows,
  canWrite,
}: {
  initialRows: CategoryRow[];
  canWrite: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState({ createOpen: false, editOpen: false });
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const { pending, create, update, remove } = useCategories();

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

  const categoriesHeader = {
    filters: [],
    import: canWrite
      ? [
          {
            title: 'Nueva categoría',
            icon: <Plus className="h-4 w-4" />,
            variant: 'default' as const,
            onClick: () => {
              setEditing(null);
              setDialogOpen((prev) => ({ ...prev, createOpen: true }));
            },
          },
        ]
      : [],
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-hidden">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">Tipos de activos y su configuración</p>
      </div>

      <PageHeader pageHeader={categoriesHeader} />

      <div className="flex-1 min-h-0">
        <Show
          when={initialRows.length > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
              <p>No hay categorías registradas.</p>
            </div>
          }
        >
          <MainDataTable
            columns={columns}
            data={initialRows}
            pageCount={1}
            rowCount={initialRows.length}
            paginationState={{ limit: 20 }}
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
