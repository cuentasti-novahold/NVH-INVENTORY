import type { FormConfig } from '@/shared/presentation/types/form-config.types';

export const currencyFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: 'Datos de la moneda',
      fields: [
        {
          name: 'code',
          label: 'Código ISO',
          type: 'text',
          required: true,
          gridCols: 2,
          maxLength: 3,
          placeholder: 'COP, USD, EUR…',
          pattern: { regex: '^[A-Z]{3}$', message: 'ISO-4217: 3 letras mayúsculas' },
        },
        {
          name: 'symbol',
          label: 'Símbolo',
          type: 'text',
          required: true,
          gridCols: 2,
          maxLength: 5,
          placeholder: '$, US$, €',
        },
        {
          name: 'name',
          label: 'Nombre',
          type: 'text',
          required: true,
          gridCols: 1,
          maxLength: 60,
          placeholder: 'Peso colombiano',
        },
        {
          name: 'isBase',
          label: 'Moneda base',
          type: 'switch',
          gridCols: 1,
        },
      ],
    },
  ],
};
