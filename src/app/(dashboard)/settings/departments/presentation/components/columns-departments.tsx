'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { DepartmentRow } from '../dto/department.dto';

export const departmentsColumns: ColumnDef<DepartmentRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'employeesCount',
    header: 'Empleados',
    cell: ({ row }) => {
      const count = row.original.employeesCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
