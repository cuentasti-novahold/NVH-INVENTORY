import type { FieldConfig } from '../dto/category.dto';

export const FIELD_CONFIG_PRESETS: Record<string, FieldConfig> = {
  computer: {
    processor: 'required',
    ram: 'required',
    storageCapacity: 'required',
    storageType: 'required',
    operatingSystem: 'required',
    phoneNumber: 'hidden',
    imei: 'hidden',
  },
  phone: {
    processor: 'hidden',
    ram: 'hidden',
    storageCapacity: 'optional',
    storageType: 'hidden',
    operatingSystem: 'hidden',
    phoneNumber: 'required',
    imei: 'optional',
  },
  storage: {
    processor: 'hidden',
    ram: 'hidden',
    storageCapacity: 'required',
    storageType: 'required',
    operatingSystem: 'hidden',
    phoneNumber: 'hidden',
    imei: 'hidden',
  },
  peripheral: {
    processor: 'hidden',
    ram: 'hidden',
    storageCapacity: 'hidden',
    storageType: 'hidden',
    operatingSystem: 'hidden',
    phoneNumber: 'hidden',
    imei: 'hidden',
  },
};

export const PRESET_OPTIONS = [
  { label: 'Equipo de cómputo (PC / laptop / escritorio)', value: 'computer' },
  { label: 'Celular / dispositivo móvil', value: 'phone' },
  { label: 'Disco externo / almacenamiento', value: 'storage' },
  { label: 'Periférico / accesorio', value: 'peripheral' },
];

export function detectPreset(fc: FieldConfig | null | undefined): string {
  if (!fc) return 'peripheral';
  if (fc.processor === 'required') return 'computer';
  if (fc.phoneNumber === 'required') return 'phone';
  if (fc.storageCapacity === 'required') return 'storage';
  return 'peripheral';
}
