import * as yup from 'yup';

export const locationCreateSchema = yup.object({
  name: yup.string().trim().min(2).max(120).required('Nombre requerido'),
  address: yup.string().trim().max(500).nullable().optional(),
  cityId: yup.string().min(1).required('Ciudad requerida'),
});

export const locationUpdateSchema = locationCreateSchema.partial();
