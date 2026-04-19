import * as yup from 'yup';

type FieldVisibility = 'required' | 'optional' | 'hidden';
type FieldConfig = Record<string, FieldVisibility>;

const ASSET_STATUSES = ['GOOD', 'REGULAR', 'BAD', 'DAMAGED', 'RETIRED'] as const;
const STORAGE_TYPES = ['SSD', 'HDD', 'NVME', 'EMMC'] as const;

function specField(fc: FieldConfig, key: string): FieldVisibility {
  return fc[key] ?? 'optional';
}

function conditionalString(fc: FieldConfig, key: string) {
  const vis = specField(fc, key);
  if (vis === 'hidden') return yup.string().nullable().optional();
  if (vis === 'required') return yup.string().trim().required(`${key} requerido`).nullable();
  return yup.string().trim().nullable().optional();
}

export function buildAssetCreateSchema(fieldConfig: FieldConfig = {}) {
  return yup.object({
    categoryId: yup.string().required('Categoría requerida'),
    assetTag: yup.string().trim().max(80).nullable().optional(),
    hostname: yup.string().trim().max(120).nullable().optional(),
    brand: yup.string().trim().max(120).nullable().optional(),
    model: yup.string().trim().max(120).nullable().optional(),
    serialNumber: yup.string().trim().max(120).nullable().optional(),
    processor: conditionalString(fieldConfig, 'processor'),
    ram: conditionalString(fieldConfig, 'ram'),
    storageCapacity: conditionalString(fieldConfig, 'storageCapacity'),
    storageType: yup
      .mixed<(typeof STORAGE_TYPES)[number]>()
      .oneOf([...STORAGE_TYPES, null as unknown as (typeof STORAGE_TYPES)[number]])
      .nullable()
      .optional(),
    operatingSystem: conditionalString(fieldConfig, 'operatingSystem'),
    phoneNumber: conditionalString(fieldConfig, 'phoneNumber'),
    imei: conditionalString(fieldConfig, 'imei'),
    purchasePrice: yup.number().positive().nullable().optional(),
    currencyCode: yup.string().max(10).nullable().optional(),
    salvageValue: yup.number().min(0).nullable().optional(),
    usefulLifeYears: yup.number().integer().positive().max(50).nullable().optional(),
    purchaseDate: yup.string().nullable().optional(),
    generalStatus: yup
      .mixed<(typeof ASSET_STATUSES)[number]>()
      .oneOf([...ASSET_STATUSES])
      .optional(),
    functionalStatus: yup
      .mixed<(typeof ASSET_STATUSES)[number]>()
      .oneOf([...ASSET_STATUSES])
      .optional(),
    locationId: yup.string().nullable().optional(),
    bodegaId: yup.string().nullable().optional(),
    parentAssetId: yup.string().nullable().optional(),
    notes: yup.string().max(2000).nullable().optional(),
  });
}

export function buildAssetUpdateSchema(fieldConfig: FieldConfig = {}) {
  return yup.object({
    categoryId: yup.string().optional(),
    assetTag: yup.string().trim().max(80).nullable().optional(),
    hostname: yup.string().trim().max(120).nullable().optional(),
    brand: yup.string().trim().max(120).nullable().optional(),
    model: yup.string().trim().max(120).nullable().optional(),
    serialNumber: yup.string().trim().max(120).nullable().optional(),
    processor: specField(fieldConfig, 'processor') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    ram: specField(fieldConfig, 'ram') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    storageCapacity: specField(fieldConfig, 'storageCapacity') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    storageType: yup
      .mixed<(typeof STORAGE_TYPES)[number]>()
      .oneOf([...STORAGE_TYPES, null as unknown as (typeof STORAGE_TYPES)[number]])
      .nullable()
      .optional(),
    operatingSystem: specField(fieldConfig, 'operatingSystem') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    phoneNumber: specField(fieldConfig, 'phoneNumber') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    imei: specField(fieldConfig, 'imei') === 'hidden'
      ? yup.string().nullable().optional()
      : yup.string().trim().nullable().optional(),
    purchasePrice: yup.number().positive().nullable().optional(),
    currencyCode: yup.string().max(10).nullable().optional(),
    salvageValue: yup.number().min(0).nullable().optional(),
    usefulLifeYears: yup.number().integer().positive().max(50).nullable().optional(),
    purchaseDate: yup.string().nullable().optional(),
    generalStatus: yup.mixed<(typeof ASSET_STATUSES)[number]>().oneOf([...ASSET_STATUSES]).optional(),
    functionalStatus: yup.mixed<(typeof ASSET_STATUSES)[number]>().oneOf([...ASSET_STATUSES]).optional(),
    locationId: yup.string().nullable().optional(),
    bodegaId: yup.string().nullable().optional(),
    parentAssetId: yup.string().nullable().optional(),
    notes: yup.string().max(2000).nullable().optional(),
  });
}
