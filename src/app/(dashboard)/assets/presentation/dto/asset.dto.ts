export type AssetStatus = 'GOOD' | 'REGULAR' | 'BAD' | 'DAMAGED' | 'RETIRED';
export type StorageType = 'SSD' | 'HDD' | 'NVME' | 'EMMC';

export interface AssetRow {
  id: string;
  assetCode: string;
  assetTag: string | null;
  hostname: string | null;
  companyId: string;
  companyCode: string;
  companyName: string;
  categoryId: string;
  categoryName: string;
  categoryPrefix: string;
  categoryFieldConfig: Record<string, string> | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  processor: string | null;
  ram: string | null;
  storageCapacity: string | null;
  storageType: StorageType | null;
  operatingSystem: string | null;
  phoneNumber: string | null;
  imei: string | null;
  purchasePrice: string | null;
  currencyCode: string | null;
  purchasePriceBase: string | null;
  salvageValue: string | null;
  usefulLifeYears: number | null;
  purchaseDate: string | null;
  generalStatus: AssetStatus;
  functionalStatus: AssetStatus;
  lastRevision: string | null;
  notes: string | null;
  locationId: string | null;
  locationName: string | null;
  bodegaId: string | null;
  bodegaName: string | null;
  parentAssetId: string | null;
  parentAssetCode: string | null;
  assignmentsCount: number;
  componentsCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateAssetDTO {
  companyId: string;
  categoryId: string;
  assetTag?: string | null;
  hostname?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  processor?: string | null;
  ram?: string | null;
  storageCapacity?: string | null;
  storageType?: StorageType | null;
  operatingSystem?: string | null;
  phoneNumber?: string | null;
  imei?: string | null;
  purchasePrice?: number | null;
  currencyCode?: string | null;
  salvageValue?: number | null;
  usefulLifeYears?: number | null;
  purchaseDate?: string | null;
  generalStatus?: AssetStatus;
  functionalStatus?: AssetStatus;
  locationId?: string;
  bodegaId?: string | null;
  parentAssetId?: string | null;
  notes?: string | null;
}

export type UpdateAssetDTO = Partial<CreateAssetDTO>;

export interface AssetDetailRow extends AssetRow {
  activeAssignment: {
    employeeId: string;
    employeeName: string;
    assignedAt: string;
  } | null;
}

export interface AssetImportRow {
  company: string | null;
  category: string | null;
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
  purchasePrice: string | number | null;
  currencyCode: string | null;
  usefulLifeYears: string | number | null;
  purchaseDate: string | null;
  generalStatus: string | null;
  location: string | null;
  bodega: string | null;
  notes: string | null;
}
