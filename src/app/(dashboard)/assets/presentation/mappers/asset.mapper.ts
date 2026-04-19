import type { AssetRow, AssetDetailRow, AssetStatus, StorageType } from '../dto/asset.dto';

type PrismaAssetWithRelations = {
  id: string;
  assetCode: string;
  assetTag: string | null;
  hostname: string | null;
  categoryId: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  processor: string | null;
  ram: string | null;
  storageCapacity: string | null;
  storageType: string | null;
  operatingSystem: string | null;
  phoneNumber: string | null;
  imei: string | null;
  purchasePrice: { toString(): string } | null;
  currencyCode: string | null;
  purchasePriceBase: { toString(): string } | null;
  salvageValue: { toString(): string } | null;
  usefulLifeYears: number | null;
  purchaseDate: Date | null;
  generalStatus: string;
  functionalStatus: string;
  lastRevision: Date | null;
  notes: string | null;
  locationId: string | null;
  bodegaId: string | null;
  parentAssetId: string | null;
  isActive: boolean;
  createdAt: Date;
  category: {
    name: string;
    prefix: string;
    fieldConfig: unknown;
  };
  location: { name: string } | null;
  bodega: { name: string } | null;
  parentAsset: { assetCode: string } | null;
  _count: { assignments: number; components: number };
};

export const assetDetailInclude = {
  category: { select: { name: true, prefix: true, fieldConfig: true } },
  location: { select: { name: true } },
  bodega: { select: { name: true } },
  parentAsset: { select: { assetCode: true } },
  _count: { select: { assignments: true, components: true } },
  assignments: {
    where: { returnedAt: null },
    include: { employee: { select: { id: true, fullName: true } } },
    take: 1,
    orderBy: { assignedAt: 'desc' as const },
  },
} as const;

export const assetInclude = {
  category: { select: { name: true, prefix: true, fieldConfig: true } },
  location: { select: { name: true } },
  bodega: { select: { name: true } },
  parentAsset: { select: { assetCode: true } },
  _count: { select: { assignments: true, components: true } },
} as const;

type PrismaAssetDetailWithRelations = PrismaAssetWithRelations & {
  assignments: Array<{
    employeeId: string;
    assignedAt: Date;
    employee: { id: string; fullName: string };
  }>;
};

export function toAssetDetailRow(a: PrismaAssetDetailWithRelations): AssetDetailRow {
  const active = a.assignments[0] ?? null;
  return {
    ...toAssetRow(a),
    activeAssignment: active
      ? {
          employeeId: active.employee.id,
          employeeName: active.employee.fullName,
          assignedAt: active.assignedAt.toISOString(),
        }
      : null,
  };
}

export function toAssetRow(a: PrismaAssetWithRelations): AssetRow {
  return {
    id: a.id,
    assetCode: a.assetCode,
    assetTag: a.assetTag,
    hostname: a.hostname,
    categoryId: a.categoryId,
    categoryName: a.category.name,
    categoryPrefix: a.category.prefix,
    categoryFieldConfig: (a.category.fieldConfig as Record<string, string> | null) ?? null,
    brand: a.brand,
    model: a.model,
    serialNumber: a.serialNumber,
    processor: a.processor,
    ram: a.ram,
    storageCapacity: a.storageCapacity,
    storageType: (a.storageType as StorageType | null),
    operatingSystem: a.operatingSystem,
    phoneNumber: a.phoneNumber,
    imei: a.imei,
    purchasePrice: a.purchasePrice?.toString() ?? null,
    currencyCode: a.currencyCode,
    purchasePriceBase: a.purchasePriceBase?.toString() ?? null,
    salvageValue: a.salvageValue?.toString() ?? null,
    usefulLifeYears: a.usefulLifeYears,
    purchaseDate: a.purchaseDate?.toISOString() ?? null,
    generalStatus: a.generalStatus as AssetStatus,
    functionalStatus: a.functionalStatus as AssetStatus,
    lastRevision: a.lastRevision?.toISOString() ?? null,
    notes: a.notes,
    locationId: a.locationId,
    locationName: a.location?.name ?? null,
    bodegaId: a.bodegaId,
    bodegaName: a.bodega?.name ?? null,
    parentAssetId: a.parentAssetId,
    parentAssetCode: a.parentAsset?.assetCode ?? null,
    assignmentsCount: a._count.assignments,
    componentsCount: a._count.components,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  };
}
