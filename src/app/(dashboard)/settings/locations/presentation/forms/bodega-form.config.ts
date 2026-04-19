import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchLocationsAction } from '../../actions';

export function buildBodegaFormConfig(opts: { initialLocationLabel?: string }): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Datos de la bodega',
        fields: [
          {
            name: 'name',
            label: 'Nombre',
            type: 'text',
            required: true,
            gridCols: 1,
            maxLength: 120,
          },
          {
            name: 'locationId',
            label: 'Sede',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchLocationsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar sede…',
              minChars: 1,
              initialDisplayValue: opts.initialLocationLabel,
            },
          },
        ],
      },
    ],
  };
}
