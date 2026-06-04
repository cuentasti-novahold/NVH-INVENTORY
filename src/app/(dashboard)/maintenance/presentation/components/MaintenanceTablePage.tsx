'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { maintenanceColumns } from './columns-maintenance';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { buildMaintenanceFormConfig } from '../forms/maintenance-form.config';
import { useMaintenances } from '../hooks/use-maintenances';
import type { MaintenanceRow, MaintenanceType, CreateMaintenanceDTO, UpdateMaintenanceDTO } from '../dto/maintenance.dto';
import type { ListMaintenancesResult } from '../../actions';

type TypeFilter = MaintenanceType | 'all';

interface Props {
  initialData: ListMaintenancesResult;
  canWrite: boolean;
  canDelete: boolean;
  currentType: TypeFilter;
}

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Revisión', value: 'REVISION' },
  { label: 'Reparación', value: 'REPAIR' },
  { label: 'Actualización', value: 'UPGRADE' },
  { label: 'Limpieza', value: 'CLEANING' },
];

export function MaintenanceTablePage({
  initialData,
  canWrite,
  canDelete,
  currentType,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<MaintenanceRow | null>(null);
  const formConfig = buildMaintenanceFormConfig();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create, update, remove } = useMaintenances();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function onNextPage() {
    updateParams({ afterCursor: initialData.pageInfo.endCursor ?? null, beforeCursor: null });
  }

  function onPrevPage() {
    updateParams({ beforeCursor: initialData.pageInfo.startCursor ?? null, afterCursor: null });
  }

  const columns: ColumnDef<MaintenanceRow>[] = useMemo(
    () => [
      ...maintenanceColumns,
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {canWrite && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Editar mantenimiento"
                onClick={() => setEditRow(row.original)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Eliminar mantenimiento"
                onClick={() => {
                  if (confirm('¿Eliminar este registro de mantenimiento?')) {
                    remove(row.original.id, () => {});
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canWrite, canDelete, remove],
  );

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0">
          <h1 className="text-lg font-semibold tracking-tight">Mantenimientos</h1>
          <p className="text-xs text-muted-foreground">
            Historial de mantenimientos y revisiones de activos.
          </p>
        </div>
      </div>

      <TablePageToolbar
        config={{
          toggles: TYPE_FILTERS.map((f) => ({
            label: f.label,
            active: currentType === f.value,
            onClick: () =>
              updateParams({
                type: f.value === 'all' ? null : f.value,
                afterCursor: null,
                beforeCursor: null,
              }),
          })),
          actions: canWrite
            ? [
                {
                  label: 'Registrar mantenimiento',
                  icon: <Plus className="h-3.5 w-3.5" />,
                  onClick: () => setCreateOpen(true),
                },
              ]
            : undefined,
        }}
      />

      <div className="flex-1 min-h-0">
        <Show
          when={initialData.rows.length > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Wrench className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Sin mantenimientos</p>
              <p className="mt-1 text-xs">No hay registros que coincidan con los filtros.</p>
            </div>
          }
        >
          <MainDataTable
            columns={columns}
            data={initialData.rows}
            rowCount={initialData.rowCount}
            pageInfo={initialData.pageInfo}
            onNextPage={onNextPage}
            onPrevPage={onPrevPage}
          />
        </Show>
      </div>

      {/* Create dialog */}
      <CrudFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Registrar mantenimiento"
        formConfig={formConfig}
        defaultValues={{
          assetId: '',
          type: '',
          performedAt: '',
          performedBy: '',
          description: '',
          nextReview: '',
        }}
        isLoading={pending}
        onSubmit={(data) =>
          create(
            {
              assetId: data.assetId as string,
              type: data.type as MaintenanceType,
              performedAt: data.performedAt as string,
              performedBy: (data.performedBy as string) || null,
              description: (data.description as string) || null,
              nextReview: (data.nextReview as string) || null,
            } satisfies CreateMaintenanceDTO,
            () => setCreateOpen(false),
          )
        }
      />

      {/* Edit dialog */}
      {editRow && (
        <CrudFormDialog
          open={!!editRow}
          onOpenChange={(open) => { if (!open) setEditRow(null); }}
          title="Editar mantenimiento"
          formConfig={formConfig}
          defaultValues={{
            assetId: editRow.assetId,
            type: editRow.type,
            performedAt: editRow.performedAt.slice(0, 10),
            performedBy: editRow.performedBy ?? '',
            description: editRow.description ?? '',
            nextReview: editRow.nextReview ? editRow.nextReview.slice(0, 10) : '',
          }}
          isLoading={pending}
          onSubmit={(data) =>
            update(
              editRow.id,
              {
                type: data.type as MaintenanceType,
                performedAt: data.performedAt as string,
                performedBy: (data.performedBy as string) || null,
                description: (data.description as string) || null,
                nextReview: (data.nextReview as string) || null,
              } satisfies UpdateMaintenanceDTO,
              () => setEditRow(null),
            )
          }
        />
      )}
    </div>
  );
}
