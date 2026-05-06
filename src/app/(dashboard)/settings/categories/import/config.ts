// Server-only — imports Prisma. Do NOT import this file from Client Components.

import type { ExcelImportConfig } from '@/shared/excel-import/types';
import { prisma } from '@/lib/prisma';
import {
  categoriesImportColumns,
  categoriesImportDisplayName,
  categoriesImportModuleKey,
} from './config.client';
import { bulkCreateCategories } from './bulk-create';

export interface CategoryImportRow {
  name: string;
  prefix: string;
  description: string | null;
  parentName: string | null;
  defaultUsefulLife: number | null;
}

export const categoriesImportConfig: ExcelImportConfig<CategoryImportRow> = {
  moduleKey: categoriesImportModuleKey,
  displayName: categoriesImportDisplayName,
  entity: 'Category',
  sheetName: 'Categorias',
  maxRows: 5000,
  columns: [...categoriesImportColumns],

  masterValidations: [
    {
      key: 'parentName',
      lookup: async (values) => {
        const rows = await prisma.category.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Categoría padre no existe',
    },
  ],

  rowTransformer: (flat): CategoryImportRow => ({
    name: String(flat.name).trim(),
    prefix: String(flat.prefix).trim().toUpperCase(),
    description:
      flat.description != null && String(flat.description).trim() !== ''
        ? String(flat.description).trim()
        : null,
    parentName:
      flat.parentName != null && String(flat.parentName).trim() !== ''
        ? String(flat.parentName).trim()
        : null,
    defaultUsefulLife:
      flat.defaultUsefulLife != null && String(flat.defaultUsefulLife).trim() !== ''
        ? Number(flat.defaultUsefulLife)
        : null,
  }),

  handler: bulkCreateCategories,
};
