'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { CategoryRow } from '../dto/category.dto';

export const categoriesColumns: ColumnDef<CategoryRow>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  {
    accessorKey: 'prefix',
    header: 'Prefijo',
    cell: ({ row }) => <Badge variant="outline">{row.original.prefix}</Badge>,
  },
  {
    accessorKey: 'parentName',
    header: 'Padre',
    cell: ({ row }) => row.original.parentName ?? '—',
  },
  {
    accessorKey: 'defaultUsefulLife',
    header: 'Vida útil (años)',
    cell: ({ row }) => row.original.defaultUsefulLife ?? '—',
  },
  { accessorKey: 'childrenCount', header: 'Subcategorías' },
  { accessorKey: 'assetsCount', header: 'Activos' },
];
