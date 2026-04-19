import type { FormConfig } from '@/shared/presentation/types/form-config.types';

export const countryFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: 'Datos del país',
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
          name: 'code',
          label: 'Código ISO',
          type: 'text',
          required: true,
          gridCols: 2,
          maxLength: 3,
          placeholder: 'CO, US, MX…',
          pattern: { regex: '^[A-Z]{2,3}$', message: '2 o 3 letras mayúsculas' },
        },
      ],
    },
  ],
};
