import type { FormConfig } from '@/shared/presentation/types/form-config.types';

export const departmentFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: 'Datos del departamento',
      fields: [
        {
          name: 'name',
          label: 'Nombre',
          type: 'text',
          required: true,
          gridCols: 1,
          maxLength: 80,
          placeholder: 'Ej. Tecnología, Recursos Humanos…',
        },
      ],
    },
  ],
};
