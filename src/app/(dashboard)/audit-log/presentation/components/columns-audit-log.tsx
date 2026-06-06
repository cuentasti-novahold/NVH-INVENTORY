'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { AuditLogRow } from '../dto/audit-log.dto';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function ActionBadge({ action }: { action: string }) {
  const variantMap: Record<string, 'default' | 'outline' | 'destructive' | 'secondary'> = {
    CREATE: 'default',
    UPDATE: 'outline',
    DELETE: 'destructive',
  };
  const variant = variantMap[action] ?? 'secondary';
  return <Badge variant={variant}>{action}</Badge>;
}

export const auditLogColumns: ColumnDef<AuditLogRow>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{formatDateTime(row.original.createdAt)}</span>
    ),
  },
  {
    id: 'usuario',
    header: 'Usuario',
    cell: ({ row }) => {
      const label = row.original.userName ?? row.original.userEmail ?? '—';
      return <span className="text-sm">{label}</span>;
    },
  },
  {
    accessorKey: 'action',
    header: 'Acción',
    cell: ({ row }) => <ActionBadge action={row.original.action} />,
  },
  {
    id: 'entidad',
    header: 'Entidad',
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium">{row.original.entity}</p>
        <p className="text-xs text-muted-foreground font-mono">{row.original.entityId}</p>
      </div>
    ),
  },
  {
    id: 'activo',
    header: 'Activo',
    cell: ({ row }) => (
      <span className="text-sm font-mono">{row.original.assetCode ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'ip',
    header: 'IP',
    cell: ({ row }) => (
      <span className="text-sm truncate max-w-[120px] block">{row.original.ip ?? '—'}</span>
    ),
  },
];
