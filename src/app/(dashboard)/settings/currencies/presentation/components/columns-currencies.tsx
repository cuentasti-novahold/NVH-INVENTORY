'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { CurrencyRow } from '../dto/currency.dto';

export const currenciesColumns: ColumnDef<CurrencyRow>[] = [
  {
    accessorKey: 'code',
    header: 'Código',
    cell: ({ row }) => (
      <span className="font-bold font-mono">{row.original.code}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Nombre',
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
  {
    accessorKey: 'symbol',
    header: 'Símbolo',
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
        {row.original.symbol}
      </span>
    ),
  },
  {
    accessorKey: 'isBase',
    header: 'Base',
    cell: ({ row }) =>
      row.original.isBase ? (
        <Badge variant="default">Base</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'ratesCount',
    header: 'Tasas',
    cell: ({ row }) => {
      const count = row.original.ratesCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
  {
    accessorKey: 'assetsCount',
    header: 'Activos',
    cell: ({ row }) => {
      const count = row.original.assetsCount;
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {count}
        </span>
      );
    },
  },
];
