import * as yup from 'yup';

export const companyCreateSchema = yup.object({
  code: yup
    .string()
    .trim()
    .matches(/^[A-Z0-9]{1,10}$/, 'Código: máx 10 caracteres alfanuméricos en mayúsculas')
    .required('Código requerido'),
  name: yup.string().trim().min(2).max(100).required('Nombre requerido'),
  isActive: yup.boolean().default(true),
});

export const companyUpdateSchema = companyCreateSchema.partial();
