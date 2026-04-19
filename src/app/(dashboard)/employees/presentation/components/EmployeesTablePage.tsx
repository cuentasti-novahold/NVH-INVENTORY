'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, PowerOff, Trash2, Plus, FileSpreadsheet, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog';
import { employeeColumns } from './columns-employees';
import { buildEmployeeFormConfig } from '../forms/employee-form.config';
import { useEmployees } from '../hooks/use-employees';
import { importEmployeesAction } from '../../actions';
import type { EmployeeRow, CreateEmployeeDTO, UpdateEmployeeDTO, EmployeeImportRow } from '../dto/employee.dto';

type IsActiveParam = 'active' | 'inactive' | 'all';

interface EmployeesTablePageProps {
  initialRows: EmployeeRow[];
  rowCount: number;
  pageCount: number;
  canWrite: boolean;
  currentPage: number;
  currentPageSize: number;
  currentIsActive: IsActiveParam;
  currentQ: string;
}

export function EmployeesTablePage({
  initialRows,
  rowCount,
  pageCount,
  canWrite,
  currentPage,
  currentPageSize,
  currentIsActive,
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

  const isActiveOptions: { label: string; value: IsActiveParam }[] = [
    { label: 'Activos', value: 'active' },
    { label: 'Inactivos', value: 'inactive' },
    { label: 'Todos', value: 'all' },
  ];

  const employeesHeader = {
    filters: isActiveOptions.map((opt) => ({
      title: opt.label,
      variant: (currentIsActive === opt.value ? 'default' : 'outline') as 'default' | 'outline',
      onClick: () => updateParams({ isActive: opt.value, page: 1 }),
    })),
    import: canWrite
      ? [
          {
            title: 'Importar Excel',
            icon: <FileSpreadsheet className="h-4 w-4" />,
            variant: 'outline' as const,
            onClick: () => setDialogs((s) => ({ ...s, importOpen: true })),
          },
          {
            title: 'Nuevo empleado',
            icon: <Plus className="h-4 w-4" />,
            variant: 'default' as const,
            onClick: () => {
              setEditing(null);
              setDialogs((s) => ({ ...s, createOpen: true }));
            },
          },
        ]
      : [],
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Empleados</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de empleados, asignaciones y estado activo/inactivo.
          </p>
        </div>
      </div>

      <PageHeader pageHeader={employeesHeader} />

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
          pageCount={pageCount}
          paginationState={{ page: currentPage, limit: currentPageSize }}
          onPaginationChange={(updater) => {
            const next = updater({
              pageIndex: currentPage - 1,
              pageSize: currentPageSize,
            });
            updateParams({ page: next.pageIndex + 1, pageSize: next.pageSize });
          }}
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
          create(values as CreateEmployeeDTO, () =>
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

      <ExcelImportDialog<EmployeeImportRow>
        open={dialogs.importOpen}
        onOpenChange={(open) => setDialogs((s) => ({ ...s, importOpen: open }))}
        title="Importar empleados"
        description="Columnas requeridas: fullName, email. Opcionales: phone, position, department, city, location, isActive."
        expectedColumns={['fullName', 'email']}
        action={async (rows) => {
          const r = await importEmployeesAction(rows);
          if (!r.ok)
            return { inserted: 0, skipped: rows.length, errors: [{ row: 0, message: r.message }] };
          return r.data;
        }}
        parseRow={(raw) => ({
          fullName: (raw.fullName as string | null) ?? null,
          email: (raw.email as string | null) ?? null,
          phone: (raw.phone as string | null) ?? null,
          position: (raw.position as string | null) ?? null,
          department: (raw.department as string | null) ?? null,
          city: (raw.city as string | null) ?? null,
          location: (raw.location as string | null) ?? null,
          isActive: (raw.isActive as string | boolean | null) ?? null,
        })}
      />
    </div>
  );
}
