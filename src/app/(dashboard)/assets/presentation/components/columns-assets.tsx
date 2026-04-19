'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { AssetRow, AssetStatus } from '../dto/asset.dto';

const STATUS_LABELS: Record<AssetStatus, string> = {
  GOOD: 'Bueno',
  REGULAR: 'Regular',
  BAD: 'Malo',
  DAMAGED: 'Dañado',
  RETIRED: 'Retirado',
};

const STATUS_VARIANT: Record<AssetStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  GOOD: 'default',
  REGULAR: 'secondary',
  BAD: 'destructive',
  DAMAGED: 'destructive',
  RETIRED: 'outline',
};

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="text-xs">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export const assetColumns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: 'assetCode',
    header: 'Código',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold">{row.original.assetCode}</span>
    ),
  },
  {
    accessorKey: 'categoryName',
    header: 'Categoría',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.categoryName}</span>
    ),
  },
  {
    id: 'brandModel',
    header: 'Marca / Modelo',
    cell: ({ row }) => {
      const { brand, model } = row.original;
      if (!brand && !model) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-col gap-0.5">
          {brand && <span className="text-sm font-medium">{brand}</span>}
          {model && <span className="text-xs text-muted-foreground">{model}</span>}
        </div>
      );
    },
  },
  {
    accessorKey: 'generalStatus',
    header: 'Estado general',
    cell: ({ row }) => <StatusBadge status={row.original.generalStatus} />,
  },
  {
    accessorKey: 'functionalStatus',
    header: 'Estado funcional',
    cell: ({ row }) => <StatusBadge status={row.original.functionalStatus} />,
  },
  {
    id: 'location',
    header: 'Sede / Bodega',
    cell: ({ row }) => {
      const { locationName, bodegaName } = row.original;
      if (!locationName && !bodegaName) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-col gap-0.5">
          {locationName && <span className="text-sm">{locationName}</span>}
          {bodegaName && <span className="text-xs text-muted-foreground">{bodegaName}</span>}
        </div>
      );
    },
  },
  {
    id: 'assignments',
    header: 'Asignado',
    cell: ({ row }) =>
      row.original.assignmentsCount > 0 ? (
        <Badge variant="default" className="text-xs">Sí</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">No</span>
      ),
  },
];
