import type { FormConfig } from '@/shared/presentation/types/form-config.types';

export const companyFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: 'Datos de la empresa',
      fields: [
        {
          name: 'code',
          label: 'Código',
          type: 'text',
          required: true,
          gridCols: 2,
          maxLength: 10,
          placeholder: 'NVH, ARCHA…',
          pattern: { regex: '^[A-Z0-9]{1,10}$', message: 'Máx 10 caracteres alfanuméricos mayúsculas' },
        },
        {
          name: 'name',
          label: 'Nombre',
          type: 'text',
          required: true,
          gridCols: 2,
          maxLength: 100,
          placeholder: 'Novahold S.A.S.',
        },
        {
          name: 'isActive',
          label: 'Activa',
          type: 'switch',
          gridCols: 1,
        },
      ],
    },
  ],
};
