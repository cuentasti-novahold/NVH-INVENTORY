import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchCountriesAction } from '../../actions';

export function buildCityFormConfig(opts: { initialCountryLabel?: string }): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Datos de la ciudad',
        fields: [
          {
            name: 'name',
            label: 'Nombre',
            type: 'text',
            required: true,
            gridCols: 1,
            maxLength: 80,
          },
          {
            name: 'countryId',
            label: 'País',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchCountriesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar país…',
              minChars: 1,
              initialDisplayValue: opts.initialCountryLabel,
            },
          },
        ],
      },
    ],
  };
}
