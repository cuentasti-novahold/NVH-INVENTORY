'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, PowerOff, Trash2, Plus, FileSpreadsheet, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { ExcelImportDialog } from '@/shared/excel-import/components/ExcelImportDialog';
import { employeeColumns } from './columns-employees';
import { buildEmployeeFormConfig } from '../forms/employee-form.config';
import { useEmployees } from '../hooks/use-employees';
import type { EmployeeRow, CreateEmployeeDTO, UpdateEmployeeDTO } from '../dto/employee.dto';
import type { PageInfo } from '@/shared/types/pagination';

type IsActiveParam = 'active' | 'inactive' | 'all';

interface EmployeesTablePageProps {
  initialRows: EmployeeRow[];
  rowCount: number;
  pageInfo: PageInfo;
  canWrite: boolean;
  currentPageSize: number;
  currentIsActive: IsActiveParam;
  currentQ: string;
}

export function EmployeesTablePage({
  initialRows,
  rowCount,
  pageInfo,
  canWrite,
  currentPageSize,
  currentIsActive,
  currentQ,
}: EmployeesTablePageProps) {
  const [dialogs, setDialogs] = useState({
    createOpen: false,
    editOpen: false,
    importOpen: false,
  });
  const [editing, setEditing] = useState<EmployeeRow | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create, update, remove, deactivate } = useEmployees();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const columns: ColumnDef<EmployeeRow>[] = useMemo(
    () => [
      ...employeeColumns,
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
                  setDialogs((s) => ({ ...s, editOpen: true }));
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
                  if (row.original.assignmentsCount > 0) {
                    toast.error(
                      'No se puede eliminar: tiene asignaciones. Usá "Desactivar".',
                    );
                    return;
                  }
                  if (confirm(`¿Eliminar a ${row.original.fullName}?`)) {
                    remove(row.original.id, () => {});
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : null,
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
          <Users className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0">
          <h1 className="text-lg font-semibold tracking-tight">Empleados</h1>
          <p className="text-xs text-muted-foreground">
            Gestión de empleados, asignaciones y estado activo/inactivo.
          </p>
        </div>
      </div>

      <TablePageToolbar config={{
        search: { value: currentQ, onChange: (q) => updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }), placeholder: 'Buscar por nombre, email...' },
        toggles: isActiveOptions.map((opt) => ({ label: opt.label, active: currentIsActive === opt.value, onClick: () => updateParams({ isActive: opt.value, afterCursor: null, beforeCursor: null }) })),
        actions: canWrite ? [
          { label: 'Importar Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, variant: 'outline', onClick: () => setDialogs((s) => ({ ...s, importOpen: true })) },
          { label: 'Nuevo empleado', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => { setEditing(null); setDialogs((s) => ({ ...s, createOpen: true })); } },
        ] : undefined,
      }} />

      <div className="flex-1 min-h-0">
      <Show
        when={initialRows.length > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin empleados</p>
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
        open={dialogs.createOpen}
        onOpenChange={(open) => setDialogs((s) => ({ ...s, createOpen: open }))}
        title="Nuevo empleado"
        formConfig={buildEmployeeFormConfig({})}
        isLoading={pending}
        onSubmit={(values) =>
          create(values as unknown as CreateEmployeeDTO, () =>
            setDialogs((s) => ({ ...s, createOpen: false })),
          )
        }
      />

      <CrudFormDialog
        open={dialogs.editOpen}
        onOpenChange={(open) => setDialogs((s) => ({ ...s, editOpen: open }))}
        title={editing ? `Editar ${editing.fullName}` : 'Editar empleado'}
        formConfig={buildEmployeeFormConfig({
          initialDeptLabel: editing?.departmentName ?? undefined,
          initialCityLabel: editing?.cityName ?? undefined,
          initialLocationLabel: editing?.locationName ?? undefined,
        })}
        defaultValues={
          editing
            ? {
                fullName: editing.fullName,
                email: editing.email,
                phone: editing.phone ?? undefined,
                position: editing.position ?? undefined,
                departmentId: editing.departmentId ?? undefined,
                cityId: editing.cityId ?? undefined,
                locationId: editing.locationId ?? undefined,
                isActive: editing.isActive,
              }
            : undefined
        }
        isLoading={pending}
        onSubmit={(values) => {
          if (!editing) return;
          update(editing.id, values as UpdateEmployeeDTO, () =>
            setDialogs((s) => ({ ...s, editOpen: false })),
          );
        }}
      />

      <ExcelImportDialog
        open={dialogs.importOpen}
        onOpenChange={(open) => setDialogs((s) => ({ ...s, importOpen: open }))}
        moduleKey="employees"
        title="Importar empleados"
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
