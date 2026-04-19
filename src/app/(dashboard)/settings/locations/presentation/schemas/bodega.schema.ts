import * as yup from 'yup';

export const bodegaCreateSchema = yup.object({
  name: yup.string().trim().min(2).max(120).required('Nombre requerido'),
  locationId: yup.string().min(1).required('Sede requerida'),
});

export const bodegaUpdateSchema = bodegaCreateSchema.partial();
