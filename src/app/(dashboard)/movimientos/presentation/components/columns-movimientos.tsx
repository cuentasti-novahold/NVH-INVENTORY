'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { MovementRow, MovementType } from '../dto/movement.dto';

const TYPE_COLORS: Record<MovementType, string> = {
  RELOCATION: 'bg-blue-100 text-blue-800',
  LOAN: 'bg-amber-100 text-amber-800',
  REPAIR: 'bg-orange-100 text-orange-800',
  RETURN_FROM_REPAIR: 'bg-green-100 text-green-800',
  AUDIT: 'bg-slate-100 text-slate-700',
};

const TYPE_LABELS: Record<MovementType, string> = {
  RELOCATION: 'Traslado',
  LOAN: 'Préstamo',
  REPAIR: 'Reparación',
  RETURN_FROM_REPAIR: 'Retorno',
  AUDIT: 'Auditoría',
};

function TypeBadge({ type }: { type: MovementType }) {
  return <Badge className={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const movimientosColumns: ColumnDef<MovementRow>[] = [
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
    accessorKey: 'fromLocationName',
    header: 'Desde',
    cell: ({ row }) => (
      <div>
        <p className="text-sm">{row.original.fromLocationName ?? '—'}</p>
        {row.original.fromBodegaName && (
          <p className="text-xs text-muted-foreground">{row.original.fromBodegaName}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'toLocationName',
    header: 'Hacia',
    cell: ({ row }) => (
      <div>
        <p className="text-sm">{row.original.toLocationName}</p>
        {row.original.toBodegaName && (
          <p className="text-xs text-muted-foreground">{row.original.toBodegaName}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'movementType',
    header: 'Tipo',
    cell: ({ row }) => <TypeBadge type={row.original.movementType} />,
  },
  {
    accessorKey: 'movedByName',
    header: 'Registrado por',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.movedByName ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'movedAt',
    header: 'Fecha',
    cell: ({ row }) => (
      <span className="text-sm">{formatDate(row.original.movedAt)}</span>
    ),
  },
];
