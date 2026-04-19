'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { BodegaRow } from '../dto/bodega.dto';

export const bodegasColumns: ColumnDef<BodegaRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'locationName',
    header: 'Sede',
    cell: ({ row }) => <span className="font-medium">{row.original.locationName}</span>,
  },
  {
    accessorKey: 'cityName',
    header: 'Ciudad',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.cityName}</span>
    ),
  },
  {
    accessorKey: 'assetsCount',
    header: 'Activos',
    cell: ({ row }) => {
      const count = row.original.assetsCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent tabular-nums">
          {count}
        </span>
      );
    },
  },
];
