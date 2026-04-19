'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CityRow } from '../dto/city.dto';

export const citiesColumns: ColumnDef<CityRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'countryName',
    header: 'País',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.countryName}</span>
    ),
  },
  {
    accessorKey: 'locationsCount',
    header: 'Sedes',
    cell: ({ row }) => {
      const count = row.original.locationsCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
