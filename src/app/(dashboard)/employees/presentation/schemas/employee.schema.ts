import * as yup from 'yup';

export const employeeCreateSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(120, 'Máximo 120 caracteres')
    .required('Nombre completo requerido'),
  email: yup
    .string()
    .trim()
    .lowercase()
    .email('Correo inválido')
    .max(160)
    .required('Correo requerido'),
  phone: yup.string().trim().max(40).nullable().optional(),
  position: yup.string().trim().max(120).nullable().optional(),
  departmentId: yup.string().nullable().optional(),
  departmentName: yup.string().trim().max(120).nullable().optional(),
  cityId: yup.string().nullable().optional(),
  locationId: yup.string().nullable().optional(),
  isActive: yup.boolean().optional(),
});

export const employeeUpdateSchema = yup.object({
  fullName: yup.string().trim().min(2).max(120).optional(),
  email: yup.string().trim().lowercase().email('Correo inválido').max(160).optional(),
  phone: yup.string().trim().max(40).nullable().optional(),
  position: yup.string().trim().max(120).nullable().optional(),
  departmentId: yup.string().nullable().optional(),
  departmentName: yup.string().trim().max(120).nullable().optional(),
  cityId: yup.string().nullable().optional(),
  locationId: yup.string().nullable().optional(),
  isActive: yup.boolean().optional(),
});
