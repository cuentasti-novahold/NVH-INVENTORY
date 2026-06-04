'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { MaintenanceRow, MaintenanceType } from '../dto/maintenance.dto';

const TYPE_COLORS: Record<MaintenanceType, string> = {
  REVISION: 'bg-blue-100 text-blue-800',
  REPAIR: 'bg-orange-100 text-orange-800',
  UPGRADE: 'bg-purple-100 text-purple-800',
  CLEANING: 'bg-green-100 text-green-800',
};

const TYPE_LABELS: Record<MaintenanceType, string> = {
  REVISION: 'Revisión',
  REPAIR: 'Reparación',
  UPGRADE: 'Actualización',
  CLEANING: 'Limpieza',
};

function TypeBadge({ type }: { type: MaintenanceType }) {
  return <Badge className={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export const maintenanceColumns: ColumnDef<MaintenanceRow>[] = [
  {
    accessorKey: 'assetCode',
    header: 'Activo',
    cell: ({ row }) => (
      <div>
        <p className="font-mono text-xs font-semibold">{row.original.assetCode}</p>
        <p className="text-xs text-muted-foreground">{row.original.assetLabel}</p>
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Tipo',
    cell: ({ row }) => <TypeBadge type={row.original.type} />,
  },
  {
    accessorKey: 'performedBy',
    header: 'Realizado por',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.performedBy ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'performedAt',
    header: 'Fecha',
    cell: ({ row }) => (
      <span className="text-sm">{formatDate(row.original.performedAt)}</span>
    ),
  },
  {
    accessorKey: 'nextReview',
    header: 'Próxima revisión',
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.nextReview ? formatDate(row.original.nextReview) : '—'}
      </span>
    ),
  },
];
