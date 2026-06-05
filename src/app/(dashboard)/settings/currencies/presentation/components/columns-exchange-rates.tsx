'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ExchangeRateRow } from '../dto/exchange-rate.dto';

export const exchangeRatesColumns: ColumnDef<ExchangeRateRow>[] = [
  {
    accessorKey: 'currencyCode',
    header: 'Moneda',
    cell: ({ row }) => (
      <span className="font-bold font-mono">{row.original.currencyCode}</span>
    ),
  },
  {
    accessorKey: 'rateToBase',
    header: 'Tasa a base (COP)',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {Number(row.original.rateToBase).toLocaleString('es-CO', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        })}
      </span>
    ),
  },
  {
    accessorKey: 'effectiveDate',
    header: 'Fecha efectiva',
    cell: ({ row }) => (
      <span>
        {new Date(row.original.effectiveDate).toLocaleDateString('es-CO', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </span>
    ),
  },
  {
    accessorKey: 'source',
    header: 'Fuente',
    cell: ({ row }) =>
      row.original.source ? (
        <span>{row.original.source}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];
