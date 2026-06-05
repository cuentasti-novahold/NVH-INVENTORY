import * as yup from 'yup';

export const currencyCreateSchema = yup.object({
  code:   yup.string().trim().matches(/^[A-Z]{3}$/, 'ISO-4217: 3 letras mayúsculas').required('Código requerido'),
  name:   yup.string().trim().min(2).max(60).required('Nombre requerido'),
  symbol: yup.string().trim().min(1).max(5).required('Símbolo requerido'),
  isBase: yup.boolean().default(false),
});

export const currencyUpdateSchema = currencyCreateSchema.partial();
