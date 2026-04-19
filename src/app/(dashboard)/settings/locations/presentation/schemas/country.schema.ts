import * as yup from 'yup';

export const countryCreateSchema = yup.object({
  name: yup.string().trim().min(2).max(80).required('Nombre requerido'),
  code: yup
    .string()
    .trim()
    .matches(/^[A-Z]{2,3}$/, 'ISO-3166: 2 o 3 letras mayúsculas')
    .required('Código requerido'),
});

export const countryUpdateSchema = countryCreateSchema.partial();
