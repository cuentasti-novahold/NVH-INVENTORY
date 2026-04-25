'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, ClipboardList, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { ExcelExportButton } from '@/shared/ui/components/ExcelExportButton';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';
import { employeeAssignmentColumns } from './columns-assignments';
import { exportAssignmentsAction } from '../../actions';
import type { EmployeeAssignmentRow } from '../dto/assignment.dto';
import type { PageInfo } from '@/shared/types/pagination';

interface AssignmentsTablePageProps {
  initialRows: EmployeeAssignmentRow[];
  rowCount: number;
  pageInfo: PageInfo;
  canWrite: boolean;
  canAdmin: boolean;
  currentPageSize: number;
  currentQ: string;
}

export function AssignmentsTablePage({
  initialRows,
  rowCount,
  pageInfo,
  canWrite,
  canAdmin,
  currentPageSize,
}: AssignmentsTablePageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<EmployeeAssignmentRow | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const columns: ColumnDef<EmployeeAssignmentRow>[] = useMemo(
    () => [
      ...employeeAssignmentColumns,
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setDetailEmployee(row.original)}
          >
            <Eye className="h-3.5 w-3.5" />
            Ver activos
          </Button>
        ),
      },
    ],
    [],
  );

  function onNextPage() {
    updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null });
  }

  function onPrevPage() {
    updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null });
  }

  const pageHeader = {
    import: canWrite
      ? [
          {
            title: 'Nueva asignación',
            icon: <Plus className="h-4 w-4" />,
            variant: 'default' as const,
            onClick: () => setCreateOpen(true),
          },
        ]
      : [],
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Asignaciones</h1>
          <p className="text-sm text-muted-foreground">
            Activos asignados por empleado.
          </p>
        </div>
      </div>

      <PageHeader pageHeader={pageHeader} />

      <div className="flex items-center gap-2">
        <ExcelExportButton label="Asignaciones" action={exportAssignmentsAction} />
      </div>

      <div className="flex-1 min-h-0">
      <Show
        when={initialRows.length > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin asignaciones</p>
            <p className="mt-1 text-xs">Aún no hay activos asignados a empleados.</p>
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

      {/*
       * Single dialog handles both modes:
       * - employee=null + createOpen=true  → create mode (employee picker step first)
       * - employee!=null                   → detail mode (employee's assets)
       */}
      <AssignmentDetailDialog
        employee={detailEmployee}
        open={createOpen || detailEmployee !== null}
        onOpenChange={(v) => { if (!v) { setDetailEmployee(null); setCreateOpen(false); } }}
        canAdmin={canAdmin}
      />
    </div>
  );
}
