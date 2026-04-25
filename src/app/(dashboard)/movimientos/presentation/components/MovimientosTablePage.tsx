'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { Badge } from '@/components/ui/badge';
import { movimientosColumns } from './columns-movimientos';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { buildMovimientoFormConfig } from '../forms/movimiento-form.config';
import { useMovimientos } from '../hooks/use-movimientos';
import type { MovementRow, MovementType } from '../dto/movement.dto';
import type { PageInfo } from '@/shared/types/pagination';

type TypeFilter = MovementType | 'all';

interface Props {
  initialRows: MovementRow[];
  rowCount: number;
  pageInfo: PageInfo;
  canWrite: boolean;
  canDelete: boolean;
  currentPageSize: number;
  currentType: TypeFilter;
  currentAssetId?: string;
  currentAssetLabel?: string;
}

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Traslado', value: 'RELOCATION' },
  { label: 'Préstamo', value: 'LOAN' },
  { label: 'Reparación', value: 'REPAIR' },
  { label: 'Retorno', value: 'RETURN_FROM_REPAIR' },
  { label: 'Auditoría', value: 'AUDIT' },
];

export function MovimientosTablePage({
  initialRows,
  rowCount,
  pageInfo,
  canWrite,
  canDelete,
  currentPageSize,
  currentType,
  currentAssetId,
  currentAssetLabel,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const formConfig = buildMovimientoFormConfig();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create, remove } = useMovimientos();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const columns: ColumnDef<MovementRow>[] = useMemo(
    () => [
      ...movimientosColumns,
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Eliminar traslado"
                onClick={() => {
                  if (confirm('¿Eliminar este traslado? Esta acción no revierte la ubicación del activo.')) {
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
    [canDelete, remove],
  );

  function onNextPage() {
    updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null });
  }

  function onPrevPage() {
    updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null });
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ArrowRightLeft className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0">
          <h1 className="text-lg font-semibold tracking-tight">
            {currentAssetId ? 'Kardex del activo' : 'Traslados'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {currentAssetId
              ? `Historial de movimientos de ${currentAssetLabel ?? currentAssetId}`
              : 'Historial de traslados y movimientos de activos.'}
          </p>
        </div>
        {currentAssetId && (
          <Badge
            className="ml-2 cursor-pointer"
            variant="secondary"
            onClick={() => updateParams({ assetId: null, afterCursor: null, beforeCursor: null })}
          >
            Ver todos ×
          </Badge>
        )}
      </div>

      <TablePageToolbar config={{
        toggles: TYPE_FILTERS.map((f) => ({ label: f.label, active: currentType === f.value, onClick: () => updateParams({ movementType: f.value === 'all' ? null : f.value, afterCursor: null, beforeCursor: null }) })),
        actions: canWrite ? [
          { label: 'Registrar traslado', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => setCreateOpen(true) },
        ] : undefined,
      }} />

      <div className="flex-1 min-h-0">
      <Show
        when={initialRows.length > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin traslados</p>
            <p className="mt-1 text-xs">No hay registros que coincidan con los filtros.</p>
          </div>
        }
      >
        <MainDataTable
          columns={columns}
          data={initialRows}
          rowCount={rowCount}
          pageInfo={pageInfo}
          onNextPage={onNextPage}
          onPrevPage={onPrevPage}
        />
      </Show>
      </div>

      <CrudFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Registrar traslado"
        formConfig={formConfig}
        defaultValues={{
          assetId: '', fromLocationId: '', fromBodegaId: '', fromLocationName: '',
          toLocationId: '', toBodegaId: '',
          movementType: '', reason: '', notes: '',
        }}
        isLoading={pending}
        onSubmit={(data) =>
          create(
            {
              assetId: data.assetId as string,
              fromLocationId: (data.fromLocationId as string) || null,
              fromBodegaId: (data.fromBodegaId as string) || null,
              toLocationId: data.toLocationId as string,
              toBodegaId: (data.toBodegaId as string) || null,
              movementType: data.movementType as MovementType,
              reason: (data.reason as string) || null,
              notes: (data.notes as string) || null,
            },
            () => setCreateOpen(false),
          )
        }
      />
    </div>
  );
}
