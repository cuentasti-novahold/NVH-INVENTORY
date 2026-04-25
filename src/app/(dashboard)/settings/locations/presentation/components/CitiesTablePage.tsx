'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { citiesColumns } from './columns-cities';
import { buildCityFormConfig } from '../forms/city-form.config';
import { useCities } from '../hooks/use-cities';
import type { CityRow } from '../dto/city.dto';
import type { PageInfo } from '@/shared/types/pagination';

export function CitiesTablePage({
  initialRows,
  rowCount,
  pageInfo,
  paramPrefix,
  canWrite,
}: {
  initialRows: CityRow[];
  rowCount: number;
  pageInfo: PageInfo;
  paramPrefix: string;
  canWrite: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState({ createOpen: false, editOpen: false });
  const [editing, setEditing] = useState<CityRow | null>(null);
  const { pending, create, update, remove } = useCities();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      const key = `${paramPrefix}_${k}`;
      if (v === null || v === '') next.delete(key);
      else next.set(key, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const formConfig = useMemo(
    () => buildCityFormConfig({ initialCountryLabel: editing?.countryName }),
    [editing],
  );

  const columns: ColumnDef<CityRow>[] = [
    ...citiesColumns,
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

  const citiesHeader = {
    filters: [],
    import: canWrite
      ? [
          {
            title: 'Nueva ciudad',
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
    <div className="flex flex-col gap-4">
      <PageHeader pageHeader={citiesHeader} />
      <Show
        when={rowCount > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin ciudades</p>
            <p className="mt-1 text-xs">No hay ciudades registradas.</p>
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

      <CrudFormDialog
        open={dialogOpen.createOpen}
        onOpenChange={(o) => setDialogOpen((prev) => ({ ...prev, createOpen: o }))}
        title="Nueva ciudad"
        formConfig={formConfig}
        isLoading={pending}
        onSubmit={(data) =>
          create(data as never, () => setDialogOpen((prev) => ({ ...prev, createOpen: false })))
        }
      />

      <CrudFormDialog
        open={dialogOpen.editOpen}
        onOpenChange={(o) => setDialogOpen((prev) => ({ ...prev, editOpen: o }))}
        title={editing ? `Editar ${editing.name}` : 'Editar ciudad'}
        formConfig={formConfig}
        defaultValues={editing ? { name: editing.name, countryId: editing.countryId } : undefined}
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
