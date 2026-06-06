'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainDataTable } from '@/components/tables/MainTable';
import { TableSkeleton } from '@/components/tables/TableSkeleton';
import { Show } from '@/components/show/Show.component';
import { auditLogColumns } from './columns-audit-log';
import { AuditDiffDialog } from './AuditDiffDialog';
import { useAuditLogs } from '../hooks/use-audit-logs';
import type { AuditLogRow } from '../dto/audit-log.dto';
import type { ListAuditLogsResult } from '../../actions';

interface Props {
  initialData: ListAuditLogsResult;
}

interface DetailDialogState {
  open: boolean;
  row: AuditLogRow | null;
}

export function AuditLogTablePage({ initialData }: Props) {
  const { data, pending } = useAuditLogs(initialData);
  const [dialog, setDialog] = useState<DetailDialogState>({ open: false, row: null });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function onNextPage() {
    updateParams({ cursor: data.pageInfo.endCursor ?? null });
  }

  function onPrevPage() {
    updateParams({ cursor: null });
  }

  const columns: ColumnDef<AuditLogRow>[] = useMemo(
    () => [
      ...auditLogColumns,
      {
        id: 'actions',
        header: 'Cambios',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setDialog({ open: true, row: row.original })}
          >
            <Eye className="h-3.5 w-3.5" />
            Ver cambios
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <Show
        when={!pending}
        fallback={<TableSkeleton columns={7} />}
      >
        <Show
          when={data.rows.length > 0}
          fallback={
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Sin registros de auditoría</p>
              <p className="mt-1 text-xs">No hay actividad registrada todavía.</p>
            </div>
          }
        >
          <MainDataTable
            columns={columns}
            data={data.rows}
            rowCount={data.rowCount}
            pageInfo={data.pageInfo}
            onNextPage={onNextPage}
            onPrevPage={onPrevPage}
          />
        </Show>
      </Show>

      <AuditDiffDialog
        open={dialog.open}
        row={dialog.row}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />
    </div>
  );
}
