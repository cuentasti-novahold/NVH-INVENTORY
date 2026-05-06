// Client-safe slice — NO Prisma imports, NO server-only code.
// Safe to import from Client Components.

import type { ColumnDef } from '@/shared/excel-import/types';

export const categoriesImportColumns: readonly ColumnDef[] = [
  {
    header: 'Nombre*',
    key: 'name',
    type: 'string',
    required: true,
    maxLength: 100,
    width: 25,
    example: 'Computador Portátil',
  },
  {
    header: 'Prefijo*',
    key: 'prefix',
    type: 'string',
    required: true,
    maxLength: 10,
    width: 12,
    example: 'PC',
  },
  {
    header: 'Descripción',
    key: 'description',
    type: 'string',
    required: false,
    maxLength: 500,
    width: 30,
    example: 'Equipos portátiles',
  },
  {
    header: 'Categoría padre',
    key: 'parentName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 25,
    example: 'Equipos',
  },
  {
    header: 'Vida útil años',
    key: 'defaultUsefulLife',
    type: 'number',
    required: false,
    width: 15,
    example: '5',
  },
] as const;

export const categoriesImportDisplayName = 'Categorías';
export const categoriesImportModuleKey = 'categories';
