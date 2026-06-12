'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { companiesColumns } from './columns-companies';
import { companyFormConfig } from '../forms/company-form.config';
import { useCompanies } from '../hooks/use-companies';
import type { CompanyRow } from '../dto/company.dto';
import type { PageInfo } from '@/shared/types/pagination';

const CREATE_DEFAULTS = { code: '', name: '', isActive: true };

export function CompaniesTablePage({
  initialRows,
  rowCount,
  pageInfo,
  paramPrefix,
  canWrite,
  currentQ,
}: {
  initialRows: CompanyRow[];
  rowCount: number;
  pageInfo: PageInfo;
  paramPrefix: string;
  canWrite: boolean;
  currentQ: string;
}) {
  const [uiState, setUiState] = useState<{
    createOpen: boolean;
    editOpen: boolean;
    editing: CompanyRow | null;
    editKey: number;
  }>({
    createOpen: false,
    editOpen: false,
    editing: null,
    editKey: 0,
  });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create, update, remove } = useCompanies();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      const key = `${paramPrefix}_${k}`;
      if (v === null || v === '') next.delete(key);
      else next.set(key, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const columns: ColumnDef<CompanyRow>[] = [
    ...companiesColumns,
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
                setUiState((s) => ({
                  ...s,
                  editing: row.original,
                  editOpen: true,
                  editKey: s.editKey + 1,
                }));
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                if (confirm(`¿Eliminar la empresa "${row.original.name}" (${row.original.code})?`)) {
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
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0">
          <h1 className="text-lg font-semibold tracking-tight">Empresas</h1>
          <p className="text-xs text-muted-foreground">Subsidiarias y empresas del grupo.</p>
        </div>
      </div>

      <TablePageToolbar
        config={{
          search: {
            value: currentQ,
            onChange: (q) =>
              updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }),
            placeholder: 'Buscar por código o nombre…',
          },
          actions: canWrite
            ? [
                {
                  label: 'Nueva empresa',
                  icon: <Plus className="h-3.5 w-3.5" />,
                  onClick: () => setUiState((s) => ({ ...s, createOpen: true })),
                },
              ]
            : undefined,
        }}
      />

      <div className="flex-1 min-h-0">
        <Show
          when={rowCount > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Sin empresas</p>
              <p className="mt-1 text-xs">No hay empresas registradas.</p>
            </div>
          }
        >
          <MainDataTable
            columns={columns}
            data={initialRows}
            rowCount={rowCount}
            pageInfo={pageInfo}
            onNextPage={() =>
              updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null })
            }
            onPrevPage={() =>
              updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null })
            }
          />
        </Show>
      </div>

      <CrudFormDialog
        open={uiState.createOpen}
        onOpenChange={(o) => setUiState((s) => ({ ...s, createOpen: o }))}
        title="Nueva empresa"
        formConfig={companyFormConfig}
        defaultValues={CREATE_DEFAULTS}
        isLoading={pending}
        onSubmit={(data) =>
          create(data as never, () => setUiState((s) => ({ ...s, createOpen: false })))
        }
      />

      <CrudFormDialog
        key={uiState.editKey}
        open={uiState.editOpen}
        onOpenChange={(o) => setUiState((s) => ({ ...s, editOpen: o }))}
        title={uiState.editing ? `Editar ${uiState.editing.name}` : 'Editar empresa'}
        formConfig={companyFormConfig}
        defaultValues={uiState.editing ? (uiState.editing as unknown as Record<string, unknown>) : undefined}
        isLoading={pending}
        onSubmit={(data) => {
          if (!uiState.editing) return;
          update(uiState.editing.id, data as never, () =>
            setUiState((s) => ({ ...s, editOpen: false })),
          );
        }}
      />
    </div>
  );
}
