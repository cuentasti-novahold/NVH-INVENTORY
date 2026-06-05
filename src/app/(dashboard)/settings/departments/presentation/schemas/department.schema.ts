import * as yup from 'yup';

export const departmentCreateSchema = yup.object({
  name: yup.string().trim().min(2, 'Mínimo 2 caracteres').max(80, 'Máximo 80 caracteres').required('Nombre requerido'),
});

export const departmentUpdateSchema = departmentCreateSchema.partial();
