'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { countriesColumns } from './columns-countries';
import { countryFormConfig } from '../forms/country-form.config';
import { useCountries } from '../hooks/use-countries';
import type { CountryRow } from '../dto/country.dto';

export function CountriesTablePage({
  initialRows,
  canWrite,
}: {
  initialRows: CountryRow[];
  canWrite: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState({ createOpen: false, editOpen: false });
  const [editing, setEditing] = useState<CountryRow | null>(null);
  const { pending, create, update, remove } = useCountries();

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

  const countriesHeader = {
    filters: [],
    import: canWrite
      ? [
          {
            title: 'Nuevo país',
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
      <PageHeader pageHeader={countriesHeader} />
      <Show
        when={initialRows.length > 0}
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
          pageCount={1}
          rowCount={initialRows.length}
          paginationState={{ limit: 20 }}
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
