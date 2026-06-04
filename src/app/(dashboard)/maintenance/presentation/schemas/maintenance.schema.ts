import * as Yup from 'yup';

const MAINTENANCE_TYPES = ['REVISION', 'REPAIR', 'UPGRADE', 'CLEANING'] as const;

export const createMaintenanceSchema = Yup.object({
  assetId: Yup.string().required('El activo es requerido'),
  type: Yup.string()
    .oneOf(MAINTENANCE_TYPES as unknown as string[], 'Tipo de mantenimiento inválido')
    .required('El tipo es requerido'),
  performedAt: Yup.string().required('La fecha es requerida'),
  performedBy: Yup.string().nullable().optional(),
  description: Yup.string().nullable().optional(),
  nextReview: Yup.string().nullable().optional(),
});

export const updateMaintenanceSchema = Yup.object({
  type: Yup.string()
    .oneOf(MAINTENANCE_TYPES as unknown as string[], 'Tipo de mantenimiento inválido')
    .optional(),
  performedAt: Yup.string().optional(),
  performedBy: Yup.string().nullable().optional(),
  description: Yup.string().nullable().optional(),
  nextReview: Yup.string().nullable().optional(),
});
