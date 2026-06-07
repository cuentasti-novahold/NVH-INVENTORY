// Server-only — imports Prisma. Do NOT import this file from Client Components.

import type { ExcelImportConfig } from '@/shared/excel-import/types';
import { prisma } from '@/lib/prisma';
import {
  assetsImportColumns,
  assetsImportDisplayName,
  assetsImportModuleKey,
} from './config.client';
import { bulkCreateAssets } from './bulk-create';

export interface AssetImportRow {
  category: string | null;
  location: string | null;
  bodega: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  hostname: string | null;
  assetTag: string | null;
  processor: string | null;
  ram: string | null;
  storageCapacity: string | null;
  storageType: string | null;
  operatingSystem: string | null;
  purchasePrice: number | null;
  currencyCode: string | null;
  usefulLifeYears: number | null;
  purchaseDate: string | null;
  generalStatus: string | null;
  notes: string | null;
}

const trimOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export const assetsImportConfig: ExcelImportConfig<AssetImportRow> = {
  moduleKey: assetsImportModuleKey,
  displayName: assetsImportDisplayName,
  entity: 'Asset',
  sheetName: 'Activos',
  maxRows: 5000,
  columns: [...assetsImportColumns],

  masterValidations: [
    {
      key: 'category',
      lookup: async (values) => {
        const rows = await prisma.category.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Categoría no existe',
    },
    {
      key: 'location',
      lookup: async (values) => {
        const rows = await prisma.location.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Sede no existe',
    },
  ],

  rowTransformer: (flat): AssetImportRow => ({
    category: trimOrNull(flat.category),
    location: trimOrNull(flat.location),
    bodega: trimOrNull(flat.bodega),
    brand: trimOrNull(flat.brand),
    model: trimOrNull(flat.model),
    serialNumber: trimOrNull(flat.serialNumber),
    hostname: trimOrNull(flat.hostname),
    assetTag: trimOrNull(flat.assetTag),
    processor: trimOrNull(flat.processor),
    ram: trimOrNull(flat.ram),
    storageCapacity: trimOrNull(flat.storageCapacity),
    storageType: trimOrNull(flat.storageType),
    operatingSystem: trimOrNull(flat.operatingSystem),
    purchasePrice:
      flat.purchasePrice != null && String(flat.purchasePrice).trim() !== ''
        ? Number(flat.purchasePrice)
        : null,
    currencyCode: trimOrNull(flat.currencyCode),
    usefulLifeYears:
      flat.usefulLifeYears != null && String(flat.usefulLifeYears).trim() !== ''
        ? Number(flat.usefulLifeYears)
        : null,
    purchaseDate: trimOrNull(flat.purchaseDate),
    generalStatus: trimOrNull(flat.generalStatus),
    notes: trimOrNull(flat.notes),
  }),

  handler: bulkCreateAssets,
};
