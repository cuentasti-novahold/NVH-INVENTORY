import { Tag, Cpu, Activity, DollarSign, MapPin, Link2, FileText } from 'lucide-react';
import type { FormConfig, FieldVisibility } from '@/shared/presentation/types/form-config.types';
import { getCategoryFieldConfigAction, searchAssetsAction } from '@/app/(dashboard)/assets/actions';
import { searchCategoriesAction } from '@/app/(dashboard)/settings/categories/actions';
import { searchLocationsAction, searchBodegasByLocationAction } from '@/app/(dashboard)/settings/locations/actions';
import { searchCurrenciesAction } from '@/app/(dashboard)/settings/currencies/actions';
import type { AssetRow, CreateAssetDTO, AssetStatus, StorageType } from '../dto/asset.dto';

/* ─── Mode B server action — called once per unique categoryId ──── */

async function categoryFieldsServerAction(
  categoryId: unknown,
): Promise<Record<string, FieldVisibility>> {
  const r = await getCategoryFieldConfigAction(categoryId as string);
  if (!r.ok || !r.data?.fieldConfig) return {};
  const fc = r.data.fieldConfig as Record<string, string>;
  return {
    processor: (fc.processor ?? 'optional') as FieldVisibility,
    ram: (fc.ram ?? 'optional') as FieldVisibility,
    storageCapacity: (fc.storageCapacity ?? 'optional') as FieldVisibility,
    storageType: (fc.storageCapacity ?? 'optional') as FieldVisibility,
    operatingSystem: (fc.operatingSystem ?? 'optional') as FieldVisibility,
    phoneNumber: (fc.phoneNumber ?? 'optional') as FieldVisibility,
    imei: (fc.imei ?? 'optional') as FieldVisibility,
  };
}

const SPEC_VISIBILITY = { field: 'categoryId', serverAction: categoryFieldsServerAction };

/* ─── Default values ────────────────────────────────────────────── */

export function buildAssetDefaultValues(editing?: AssetRow | null): Record<string, unknown> {
  if (!editing) {
    return {
      categoryId: '', brand: '', model: '', serialNumber: '', assetTag: '', hostname: '',
      processor: '', ram: '', storageCapacity: '', storageType: '',
      operatingSystem: '', phoneNumber: '', imei: '',
      purchasePrice: '', currencyCode: 'COP', salvageValue: '', usefulLifeYears: '',
      purchaseDate: '', generalStatus: 'GOOD', functionalStatus: 'GOOD',
      locationId: '', bodegaId: '', parentAssetId: '', notes: '',
    };
  }
  return {
    categoryId: editing.categoryId,
    brand: editing.brand ?? '',
    model: editing.model ?? '',
    serialNumber: editing.serialNumber ?? '',
    assetTag: editing.assetTag ?? '',
    hostname: editing.hostname ?? '',
    processor: editing.processor ?? '',
    ram: editing.ram ?? '',
    storageCapacity: editing.storageCapacity ?? '',
    storageType: editing.storageType ?? '',
    operatingSystem: editing.operatingSystem ?? '',
    phoneNumber: editing.phoneNumber ?? '',
    imei: editing.imei ?? '',
    purchasePrice: editing.purchasePrice ?? '',
    currencyCode: editing.currencyCode ?? 'COP',
    salvageValue: editing.salvageValue ?? '',
    usefulLifeYears: editing.usefulLifeYears != null ? String(editing.usefulLifeYears) : '',
    purchaseDate: editing.purchaseDate ? editing.purchaseDate.slice(0, 10) : '',
    generalStatus: editing.generalStatus,
    functionalStatus: editing.functionalStatus,
    locationId: editing.locationId ?? '',
    bodegaId: editing.bodegaId ?? '',
    parentAssetId: editing.parentAssetId ?? '',
    notes: editing.notes ?? '',
  };
}

/* ─── DTO mapper (used in AssetsTablePage onSubmit) ─────────────── */

export function buildAssetDTO(data: Record<string, unknown>): CreateAssetDTO {
  return {
    categoryId: data.categoryId as string,
    brand: (data.brand as string) || null,
    model: (data.model as string) || null,
    serialNumber: (data.serialNumber as string) || null,
    assetTag: (data.assetTag as string) || null,
    hostname: (data.hostname as string) || null,
    processor: (data.processor as string) || null,
    ram: (data.ram as string) || null,
    storageCapacity: (data.storageCapacity as string) || null,
    storageType: ((data.storageType as string) || null) as StorageType | null,
    operatingSystem: (data.operatingSystem as string) || null,
    phoneNumber: (data.phoneNumber as string) || null,
    imei: (data.imei as string) || null,
    purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : null,
    currencyCode: (data.currencyCode as string) || 'COP',
    salvageValue: data.salvageValue ? Number(data.salvageValue) : null,
    usefulLifeYears: data.usefulLifeYears ? Number(data.usefulLifeYears) : null,
    purchaseDate: (data.purchaseDate as string) || null,
    generalStatus: ((data.generalStatus as string) || 'GOOD') as AssetStatus,
    functionalStatus: ((data.functionalStatus as string) || 'GOOD') as AssetStatus,
    locationId: (data.locationId as string) || undefined,
    bodegaId: (data.bodegaId as string) || null,
    parentAssetId: (data.parentAssetId as string) || null,
    notes: (data.notes as string) || null,
  };
}

/* ─── Form config ───────────────────────────────────────────────── */

export function buildAssetFormConfig(editing?: AssetRow | null): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Identificación',
        icon: Tag,
        accent: 'bg-blue-500',
        fields: [
          {
            name: 'categoryId',
            label: 'Categoría',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchCategoriesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar categoría…',
              minChars: 1,
              initialDisplayValue: editing?.categoryName,
            },
          },
          { name: 'brand', label: 'Marca', type: 'text', gridCols: 2, placeholder: 'Lenovo, Dell, HP…' },
          { name: 'model', label: 'Modelo', type: 'text', gridCols: 2, placeholder: 'ThinkPad X1 Carbon…' },
          { name: 'serialNumber', label: 'Número de serie', type: 'text', gridCols: 2, placeholder: 'SN-12345' },
          { name: 'assetTag', label: 'Código anterior', type: 'text', gridCols: 2, placeholder: 'ARCHAMSTA016' },
          { name: 'hostname', label: 'Hostname', type: 'text', gridCols: 2, placeholder: 'nvh-laptop-01' },
        ],
      },

      {
        title: 'Especificaciones técnicas',
        icon: Cpu,
        accent: 'bg-violet-500',
        fields: [
          {
            name: 'processor',
            label: 'Procesador',
            type: 'text',
            gridCols: 2,
            placeholder: 'Intel Core i7-12th',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'ram',
            label: 'RAM',
            type: 'text',
            gridCols: 2,
            placeholder: '16 GB DDR5',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'storageCapacity',
            label: 'Almacenamiento',
            type: 'text',
            gridCols: 2,
            placeholder: '512 GB',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'storageType',
            label: 'Tipo de disco',
            type: 'select',
            gridCols: 2,
            placeholder: 'Seleccionar…',
            options: [
              { label: 'SSD', value: 'SSD' },
              { label: 'HDD', value: 'HDD' },
              { label: 'NVMe', value: 'NVME' },
              { label: 'eMMC', value: 'EMMC' },
            ],
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'operatingSystem',
            label: 'Sistema operativo',
            type: 'text',
            gridCols: 2,
            placeholder: 'Windows 11 Pro',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'phoneNumber',
            label: 'Número de teléfono',
            type: 'text',
            gridCols: 2,
            placeholder: '+57 300 000 0000',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
          {
            name: 'imei',
            label: 'IMEI',
            type: 'text',
            gridCols: 2,
            placeholder: '35xxxxxxxxxxxxxx',
            visibilityDependsOn: SPEC_VISIBILITY,
          },
        ],
      },

      {
        title: 'Estado del activo',
        icon: Activity,
        accent: 'bg-amber-500',
        fields: [
          {
            name: 'generalStatus',
            label: 'Estado general',
            type: 'status-select',
            gridCols: 2,
            options: [
              { label: 'Bueno', value: 'GOOD', color: 'bg-emerald-500' },
              { label: 'Regular', value: 'REGULAR', color: 'bg-amber-400' },
              { label: 'Malo', value: 'BAD', color: 'bg-orange-500' },
              { label: 'Dañado', value: 'DAMAGED', color: 'bg-red-500' },
              { label: 'Retirado', value: 'RETIRED', color: 'bg-slate-400' },
            ],
          },
          {
            name: 'functionalStatus',
            label: 'Estado funcional',
            type: 'status-select',
            gridCols: 2,
            options: [
              { label: 'Bueno', value: 'GOOD', color: 'bg-emerald-500' },
              { label: 'Regular', value: 'REGULAR', color: 'bg-amber-400' },
              { label: 'Malo', value: 'BAD', color: 'bg-orange-500' },
              { label: 'Dañado', value: 'DAMAGED', color: 'bg-red-500' },
              { label: 'Retirado', value: 'RETIRED', color: 'bg-slate-400' },
            ],
          },
        ],
      },

      {
        title: 'Datos financieros',
        icon: DollarSign,
        accent: 'bg-emerald-600',
        fields: [
          { name: 'purchasePrice', label: 'Precio de compra', type: 'number', gridCols: 2, min: 0, placeholder: '0' },
          {
            name: 'currencyCode',
            label: 'Moneda',
            type: 'autocomplete',
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q: string) => searchCurrenciesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar moneda…',
              minChars: 0,
              initialDisplayValueField: 'currencyCode',
              initialDisplayValue: 'COP',
            },
          },
          { name: 'salvageValue', label: 'Valor residual (COP)', type: 'number', gridCols: 2, min: 0, placeholder: '0' },
          { name: 'usefulLifeYears', label: 'Vida útil (años)', type: 'number', gridCols: 2, min: 1, max: 50, placeholder: '3' },
          { name: 'purchaseDate', label: 'Fecha de compra', type: 'date', gridCols: 2 },
        ],
      },

      {
        title: 'Ubicación',
        icon: MapPin,
        accent: 'bg-cyan-600',
        fields: [
          editing
            ? {
                name: 'locationId',
                label: 'Sede',
                type: 'readonly' as const,
                gridCols: 2,
                format: () => editing.locationName ?? '—',
              }
            : {
                name: 'locationId',
                label: 'Sede',
                type: 'autocomplete' as const,
                required: true,
                gridCols: 2,
                autocompleteConfig: {
                  searchAction: (q) => searchLocationsAction(q).then((r) => (r.ok ? r.data : [])),
                  returnMode: 'code' as const,
                  placeholder: 'Buscar sede…',
                  minChars: 1,
                },
              },
          editing
            ? {
                name: 'bodegaId',
                label: 'Bodega',
                type: 'readonly' as const,
                gridCols: 2,
                format: () => editing.bodegaName ?? '—',
              }
            : {
                name: 'bodegaId',
                label: 'Bodega',
                type: 'autocomplete' as const,
                gridCols: 2,
                autocompleteConfig: {
                  searchAction: (q, locationId) => searchBodegasByLocationAction(q, locationId).then((r) => (r.ok ? r.data : [])),
                  watchField: 'locationId',
                  returnMode: 'code' as const,
                  placeholder: 'Buscar bodega…',
                  minChars: 1,
                },
              },
        ],
      },

      {
        title: 'Vínculos',
        icon: Link2,
        accent: 'bg-slate-500',
        fields: [
          {
            name: 'parentAssetId',
            label: 'Activo principal (si es accesorio)',
            type: 'autocomplete',
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchAssetsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar NVH-PC-00001…',
              minChars: 1,
              initialDisplayValue: editing?.parentAssetCode ?? undefined,
            },
          },
        ],
      },

      {
        title: 'Observaciones',
        icon: FileText,
        accent: 'bg-slate-400',
        fields: [
          {
            name: 'notes',
            label: 'Notas adicionales',
            type: 'textarea',
            gridCols: 1,
            placeholder: 'Notas adicionales sobre el activo…',
          },
        ],
      },
    ],
  };
}
