'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { LocationRow } from '../dto/location.dto';

export const locationsColumns: ColumnDef<LocationRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'cityName',
    header: 'Ciudad',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.cityName}</span>
    ),
  },
  {
    accessorKey: 'countryName',
    header: 'País',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.countryName}</span>
    ),
  },
  {
    accessorKey: 'address',
    header: 'Dirección',
    cell: ({ row }) =>
      row.original.address ? (
        <span className="max-w-48 truncate text-sm">{row.original.address}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'bodegasCount',
    header: 'Bodegas',
    cell: ({ row }) => {
      const count = row.original.bodegasCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
