import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchCitiesAction } from '../../actions';

export function buildLocationFormConfig(opts: { initialCityLabel?: string }): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Datos de la sede',
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
            name: 'cityId',
            label: 'Ciudad',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchCitiesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar ciudad…',
              minChars: 1,
              initialDisplayValue: opts.initialCityLabel,
            },
          },
          {
            name: 'address',
            label: 'Dirección',
            type: 'textarea',
            gridCols: 1,
            maxLength: 500,
          },
        ],
      },
    ],
  };
}
