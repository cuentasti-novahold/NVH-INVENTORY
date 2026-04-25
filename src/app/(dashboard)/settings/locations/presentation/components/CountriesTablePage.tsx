'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { countriesColumns } from './columns-countries';
import { countryFormConfig } from '../forms/country-form.config';
import { useCountries } from '../hooks/use-countries';
import type { CountryRow } from '../dto/country.dto';
import type { PageInfo } from '@/shared/types/pagination';

export function CountriesTablePage({
  initialRows,
  rowCount,
  pageInfo,
  paramPrefix,
  canWrite,
  currentQ,
}: {
  initialRows: CountryRow[];
  rowCount: number;
  pageInfo: PageInfo;
  paramPrefix: string;
  canWrite: boolean;
  currentQ: string;
}) {
  const [dialogOpen, setDialogOpen] = useState({ createOpen: false, editOpen: false });
  const [editing, setEditing] = useState<CountryRow | null>(null);
  const { pending, create, update, remove } = useCountries();

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

  const columns: ColumnDef<CountryRow>[] = [
    ...countriesColumns,
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
    <div className="flex flex-col gap-4">
      <TablePageToolbar config={{
        search: { value: currentQ, onChange: (q) => updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }), placeholder: 'Buscar por nombre o código...' },
        actions: canWrite ? [
          { label: 'Nuevo país', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => { setEditing(null); setDialogOpen((prev) => ({ ...prev, createOpen: true })); } },
        ] : undefined,
      }} />
      <Show
        when={rowCount > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Globe className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin países</p>
            <p className="mt-1 text-xs">No hay países registrados.</p>
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
        title="Nuevo país"
        formConfig={countryFormConfig}
        isLoading={pending}
        onSubmit={(data) =>
          create(data as never, () => setDialogOpen((prev) => ({ ...prev, createOpen: false })))
        }
      />

      <CrudFormDialog
        open={dialogOpen.editOpen}
        onOpenChange={(o) => setDialogOpen((prev) => ({ ...prev, editOpen: o }))}
        title={editing ? `Editar ${editing.name}` : 'Editar país'}
        formConfig={countryFormConfig}
        defaultValues={editing ? { name: editing.name, code: editing.code } : undefined}
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
