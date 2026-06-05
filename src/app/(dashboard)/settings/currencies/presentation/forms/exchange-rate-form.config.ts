import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchCurrenciesByIdAction } from '@/app/(dashboard)/settings/currencies/actions';

export const exchangeRateFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: 'Registrar tasa de cambio',
      fields: [
        {
          name: 'currencyId',
          label: 'Moneda',
          type: 'autocomplete',
          required: true,
          gridCols: 2,
          autocompleteConfig: {
            searchAction: (q) =>
              searchCurrenciesByIdAction(q).then((r) => (r.ok ? r.data : [])),
            returnMode: 'code',
            placeholder: 'Buscar moneda…',
            minChars: 0,
          },
        },
        {
          name: 'rateToBase',
          label: 'Tasa a base (COP)',
          type: 'number',
          required: true,
          gridCols: 2,
          min: 0,
          placeholder: '4000.00',
        },
        {
          name: 'effectiveDate',
          label: 'Fecha efectiva',
          type: 'date',
          required: true,
          gridCols: 2,
        },
        {
          name: 'source',
          label: 'Fuente',
          type: 'text',
          gridCols: 2,
          maxLength: 120,
          placeholder: 'Banco de la República…',
        },
      ],
    },
  ],
};
