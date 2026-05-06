'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, PowerOff, Trash2, Plus, FileSpreadsheet, Package, QrCode } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog';
import { assetColumns } from './columns-assets';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { buildAssetFormConfig, buildAssetDefaultValues, buildAssetDTO } from '../forms/asset-form.config';
import { useAssets } from '../hooks/use-assets';
import { importAssetsAction, exportInventoryAction, exportDepreciationAction, exportExpiringAction } from '../../actions';
import type { AssetRow, AssetImportRow } from '../dto/asset.dto';
import type { PageInfo } from '@/shared/types/pagination';

type IsActiveParam = 'active' | 'inactive' | 'all';

interface AssetsTablePageProps {
  initialRows: AssetRow[];
  rowCount: number;
  pageInfo: PageInfo;
  canWrite: boolean;
  currentPageSize: number;
  currentIsActive: IsActiveParam;
  currentQ: string;
}

export function AssetsTablePage({
  initialRows,
  rowCount,
  pageInfo,
  canWrite,
  currentPageSize,
  currentIsActive,
  currentQ,
}: AssetsTablePageProps) {
  const [uiState, setUiState] = useState<{
    createOpen: boolean;
    editOpen: boolean;
    importOpen: boolean;
    editing: AssetRow | null;
    editKey: number;
  }>({
    createOpen: false,
    editOpen: false,
    importOpen: false,
    editing: null,
    editKey: 0,
  });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create, update, deactivate, remove } = useAssets();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const columns: ColumnDef<AssetRow>[] = useMemo(
    () => [
      ...assetColumns,
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link href={`/assets/${row.original.assetCode}`}>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver QR / detalle">
                <QrCode className="h-4 w-4" />
              </Button>
            </Link>
            {canWrite && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setUiState((s) => ({ ...s, editing: row.original, editOpen: true, editKey: s.editKey + 1 }));
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {row.original.isActive && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => deactivate(row.original.id, () => {})}
                  >
                    <PowerOff className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    if (row.original.assignmentsCount > 0 || row.original.componentsCount > 0) {
                      toast.error('No se puede eliminar: tiene asignaciones o componentes vinculados.');
                      return;
                    }
                    if (confirm(`¿Eliminar activo ${row.original.assetCode}?`)) {
                      remove(row.original.id, () => {});
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canWrite, deactivate, remove],
  );

  function onNextPage() {
    updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null });
  }

  function onPrevPage() {
    updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null });
  }

  const isActiveOptions: { label: string; value: IsActiveParam }[] = [
    { label: 'Activos', value: 'active' },
    { label: 'Inactivos', value: 'inactive' },
    { label: 'Todos', value: 'all' },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0">
          <h1 className="text-lg font-semibold tracking-tight">Activos</h1>
          <p className="text-xs text-muted-foreground">
            Inventario de activos tecnológicos — equipos, periféricos y accesorios.
          </p>
        </div>
      </div>

      <TablePageToolbar config={{
        search: { value: currentQ, onChange: (q) => updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }), placeholder: 'Buscar por código, marca, modelo...' },
        toggles: isActiveOptions.map((opt) => ({ label: opt.label, active: currentIsActive === opt.value, onClick: () => updateParams({ isActive: opt.value, afterCursor: null, beforeCursor: null }) })),
        exports: [
          { label: 'Inventario', description: 'Lista completa de activos', action: exportInventoryAction },
          { label: 'Depreciación', description: 'Valores y vida útil restante', action: exportDepreciationAction },
          { label: 'Por vencer (6m)', description: 'Garantías próximas a vencer', action: () => exportExpiringAction(6) },
        ],
        actions: canWrite ? [
          { label: 'Importar Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, variant: 'outline', onClick: () => setUiState((s) => ({ ...s, importOpen: true })) },
          { label: 'Nuevo activo', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => setUiState((s) => ({ ...s, editing: null, createOpen: true })) },
        ] : undefined,
      }} />

      <div className="flex-1 min-h-0">
        <Show
          when={initialRows.length > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Package className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Sin activos</p>
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
        open={uiState.createOpen}
        onOpenChange={(open) => setUiState((s) => ({ ...s, createOpen: open }))}
        title="Nuevo activo"
        formConfig={buildAssetFormConfig()}
        defaultValues={buildAssetDefaultValues()}
        isLoading={pending}
        onSubmit={(data) =>
          create(buildAssetDTO(data), () => setUiState((s) => ({ ...s, createOpen: false })))
        }
      />

      <CrudFormDialog
        key={uiState.editKey}
        open={uiState.editOpen}
        onOpenChange={(open) => setUiState((s) => ({ ...s, editOpen: open }))}
        title={uiState.editing ? `Editar ${uiState.editing.assetCode}` : 'Editar activo'}
        subtitle={uiState.editing?.categoryName}
        formConfig={buildAssetFormConfig(uiState.editing)}
        defaultValues={buildAssetDefaultValues(uiState.editing)}
        isLoading={pending}
        onSubmit={(data) => {
          if (!uiState.editing) return;
          update(uiState.editing.id, buildAssetDTO(data), () =>
            setUiState((s) => ({ ...s, editOpen: false })),
          );
        }}
      />

      <ExcelImportDialog<AssetImportRow>
        open={uiState.importOpen}
        onOpenChange={(open) => setUiState((s) => ({ ...s, importOpen: true, ...(!open && { importOpen: false }) }))}
        title="Importar activos"
        description="Columnas requeridas: category. Opcionales: brand, model, serialNumber, hostname, processor, ram, storageCapacity, storageType, operatingSystem, purchasePrice, currencyCode, usefulLifeYears, purchaseDate, generalStatus, location, bodega, notes."
        expectedColumns={['category']}
        action={async (rows) => {
          const r = await importAssetsAction(rows);
          if (!r.ok) return { inserted: 0, skipped: rows.length, errors: [{ row: 0, message: r.message }] };
          return r.data;
        }}
        parseRow={(raw) => ({
          category: (raw.category as string | null) ?? null,
          brand: (raw.brand as string | null) ?? null,
          model: (raw.model as string | null) ?? null,
          serialNumber: (raw.serialNumber as string | null) ?? null,
          hostname: (raw.hostname as string | null) ?? null,
          assetTag: (raw.assetTag as string | null) ?? null,
          processor: (raw.processor as string | null) ?? null,
          ram: (raw.ram as string | null) ?? null,
          storageCapacity: (raw.storageCapacity as string | null) ?? null,
          storageType: (raw.storageType as string | null) ?? null,
          operatingSystem: (raw.operatingSystem as string | null) ?? null,
          purchasePrice: (raw.purchasePrice as string | number | null) ?? null,
          currencyCode: (raw.currencyCode as string | null) ?? null,
          usefulLifeYears: (raw.usefulLifeYears as string | number | null) ?? null,
          purchaseDate: (raw.purchaseDate as string | null) ?? null,
          generalStatus: (raw.generalStatus as string | null) ?? null,
          location: (raw.location as string | null) ?? null,
          bodega: (raw.bodega as string | null) ?? null,
          notes: (raw.notes as string | null) ?? null,
        })}
      />
    </div>
  );
}
