import { Package, MapPin, FileText } from 'lucide-react';
import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchAssetsAction, getAssetLocationAction } from '@/app/(dashboard)/assets/actions';
import { searchLocationsAction, searchBodegasByLocationAction } from '@/app/(dashboard)/settings/locations/actions';

const MOVEMENT_TYPES = [
  { label: 'Traslado', value: 'RELOCATION' },
  { label: 'Préstamo', value: 'LOAN' },
  { label: 'Reparación', value: 'REPAIR' },
  { label: 'Retorno de reparación', value: 'RETURN_FROM_REPAIR' },
  { label: 'Auditoría', value: 'AUDIT' },
];

export function buildMovimientoFormConfig(): FormConfig {
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
              cascade: {
                cascadeAction: async (assetId) => {
                  const r = await getAssetLocationAction(assetId);
                  if (!r.ok) return {};
                  const parts = [r.data.locationName, r.data.bodegaName].filter(Boolean);
                  return {
                    fromLocationId: r.data.locationId ?? '',
                    fromBodegaId: r.data.bodegaId ?? '',
                    fromLocationName: parts.join(' · ') || '—',
                  };
                },
              },
            },
          },
          {
            name: 'fromLocationName',
            label: 'Ubicación actual (origen)',
            type: 'readonly',
            gridCols: 1,
          },
          { name: 'fromLocationId', label: '', type: 'hidden' },
          { name: 'fromBodegaId', label: '', type: 'hidden' },
        ],
      },
      {
        title: 'Destino',
        icon: MapPin,
        accent: 'bg-emerald-500',
        fields: [
          {
            name: 'toLocationId',
            label: 'Ubicación destino',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: async (q) => {
                const r = await searchLocationsAction(q);
                return r.ok ? r.data : [];
              },
              returnMode: 'code',
              placeholder: 'Buscar ubicación…',
              minChars: 1,
              cascade: {
                cascadeAction: async (locationId) => {
                  const r = await searchBodegasByLocationAction('', locationId);
                  return {
                    toBodegaId: '',
                    _cascadeOptions_toBodegaId: r.ok
                      ? r.data.map((b) => ({ label: b.value, value: b.code }))
                      : [],
                  };
                },
              },
            },
          },
          {
            name: 'toBodegaId',
            label: 'Bodega destino',
            type: 'select',
            gridCols: 1,
            placeholder: 'Seleccionar bodega…',
            options: [],
            alwaysVisible: true,
          },
        ],
      },
      {
        title: 'Detalles del movimiento',
        icon: FileText,
        accent: 'bg-amber-500',
        fields: [
          {
            name: 'movementType',
            label: 'Tipo de movimiento',
            type: 'select',
            required: true,
            gridCols: 1,
            options: MOVEMENT_TYPES,
            placeholder: 'Seleccionar tipo…',
          },
          {
            name: 'reason',
            label: 'Razón',
            type: 'text',
            gridCols: 1,
            placeholder: 'Motivo del traslado (opcional)',
          },
          {
            name: 'notes',
            label: 'Notas adicionales',
            type: 'textarea',
            gridCols: 1,
            placeholder: 'Observaciones (opcional)',
          },
        ],
      },
    ],
  };
}
