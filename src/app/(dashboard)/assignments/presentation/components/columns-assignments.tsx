'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { EmployeeAssignmentRow } from '../dto/assignment.dto';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export const employeeAssignmentColumns: ColumnDef<EmployeeAssignmentRow>[] = [
  {
    accessorKey: 'employeeName',
    header: 'Empleado',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(row.original.employeeName)}
        </div>
        <div>
          <p className="text-sm font-medium">{row.original.employeeName}</p>
          <p className="text-xs text-muted-foreground">{row.original.employeeEmail}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'activeCount',
    header: 'Activos asignados',
    cell: ({ row }) => {
      const count = row.original.activeCount;
      return (
        <Badge className={count > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}>
          {count} {count === 1 ? 'activo' : 'activos'}
        </Badge>
      );
    },
  },
  {
    id: 'status',
    header: 'Estado',
    cell: ({ row }) => {
      const hasAssets = row.original.activeCount > 0;
      return (
        <Badge className={hasAssets ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}>
          {hasAssets ? 'Con activos' : 'Sin activos'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'lastAssignedAt',
    header: 'Última asignación',
    cell: ({ row }) => (
      <span className="text-sm">{formatDate(row.original.lastAssignedAt)}</span>
    ),
  },
  {
    accessorKey: 'lastReturnedAt',
    header: 'Último retiro',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.original.lastReturnedAt)}</span>
    ),
  },
];
