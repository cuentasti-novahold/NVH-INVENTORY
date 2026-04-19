import * as yup from 'yup';

export const cityCreateSchema = yup.object({
  name: yup.string().trim().min(2).max(80).required('Nombre requerido'),
  countryId: yup.string().min(1).required('País requerido'),
});

export const cityUpdateSchema = cityCreateSchema.partial();
