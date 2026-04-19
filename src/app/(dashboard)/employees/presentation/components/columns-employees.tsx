'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { EmployeeRow } from '../dto/employee.dto';

const dashIfNull = (v: string | null) =>
  v ? v : <span className="text-muted-foreground">—</span>;

export const employeeColumns: ColumnDef<EmployeeRow>[] = [
  {
    accessorKey: 'fullName',
    header: 'Nombre',
    cell: ({ row }) => {
      const name = row.original.fullName;
      const parts = name.trim().split(/\s+/);
      const initials = parts.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
      return (
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold select-none">
            {initials}
          </div>
          <span className="font-medium">{name}</span>
        </div>
      );
    },
  },
  { accessorKey: 'email', header: 'Correo' },
  {
    accessorKey: 'phone',
    header: 'Teléfono',
    cell: ({ row }) => dashIfNull(row.original.phone),
  },
  {
    accessorKey: 'position',
    header: 'Cargo',
    cell: ({ row }) => dashIfNull(row.original.position),
  },
  {
    accessorKey: 'departmentName',
    header: 'Departamento',
    cell: ({ row }) => dashIfNull(row.original.departmentName),
  },
  {
    accessorKey: 'cityName',
    header: 'Ciudad',
    cell: ({ row }) => dashIfNull(row.original.cityName),
  },
  {
    accessorKey: 'locationName',
    header: 'Sede',
    cell: ({ row }) => dashIfNull(row.original.locationName),
  },
  {
    accessorKey: 'isActive',
    header: 'Estado',
    cell: ({ row }) =>
      row.original.isActive ? (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          <span>Activo</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
          <span>Inactivo</span>
        </span>
      ),
  },
  {
    accessorKey: 'assignmentsCount',
    header: 'Asignaciones',
    cell: ({ row }) => {
      const count = row.original.assignmentsCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
