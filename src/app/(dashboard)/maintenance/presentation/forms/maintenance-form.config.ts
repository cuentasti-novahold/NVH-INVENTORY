import { Package, CalendarClock, ClipboardList } from 'lucide-react';
import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchAssetsAction } from '@/app/(dashboard)/assets/actions';

const MAINTENANCE_TYPES = [
  { label: 'Revisión', value: 'REVISION' },
  { label: 'Reparación', value: 'REPAIR' },
  { label: 'Actualización', value: 'UPGRADE' },
  { label: 'Limpieza', value: 'CLEANING' },
];

export function buildMaintenanceFormConfig(): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Activo',
        icon: Package,
        accent: 'bg-blue-500',
        fields: [
          {
            name: 'assetId',
            label: 'Activo',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: async (q) => {
                const r = await searchAssetsAction(q);
                return r.ok ? r.data : [];
              },
              returnMode: 'code',
              placeholder: 'Buscar por código, marca o modelo…',
              minChars: 1,
            },
          },
        ],
      },
      {
        title: 'Tipo y fecha',
        icon: CalendarClock,
        accent: 'bg-amber-500',
        fields: [
          {
            name: 'type',
            label: 'Tipo de mantenimiento',
            type: 'select',
            required: true,
            gridCols: 1,
            options: MAINTENANCE_TYPES,
            placeholder: 'Seleccionar tipo…',
          },
          {
            name: 'performedAt',
            label: 'Fecha de realización',
            type: 'date',
            required: true,
            gridCols: 1,
          },
          {
            name: 'performedBy',
            label: 'Realizado por',
            type: 'text',
            gridCols: 1,
            placeholder: 'Técnico responsable (opcional)',
          },
        ],
      },
      {
        title: 'Seguimiento',
        icon: ClipboardList,
        accent: 'bg-emerald-500',
        fields: [
          {
            name: 'nextReview',
            label: 'Próxima revisión',
            type: 'date',
            gridCols: 1,
          },
          {
            name: 'description',
            label: 'Descripción',
            type: 'textarea',
            gridCols: 1,
            placeholder: 'Observaciones del mantenimiento (opcional)',
          },
        ],
      },
    ],
  };
}
