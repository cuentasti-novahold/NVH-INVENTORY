'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CountryRow } from '../dto/country.dto';

export const countriesColumns: ColumnDef<CountryRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'code',
    header: 'Código',
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
        {row.original.code}
      </span>
    ),
  },
  {
    accessorKey: 'citiesCount',
    header: 'Ciudades',
    cell: ({ row }) => {
      const count = row.original.citiesCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
