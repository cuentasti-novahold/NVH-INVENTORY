import * as Yup from 'yup';

const MOVEMENT_TYPES = ['RELOCATION', 'LOAN', 'REPAIR', 'RETURN_FROM_REPAIR', 'AUDIT'] as const;

export const createMovementSchema = Yup.object({
  assetId: Yup.string().required('El activo es requerido'),
  toLocationId: Yup.string().required('La ubicación destino es requerida'),
  movementType: Yup.string()
    .oneOf(MOVEMENT_TYPES as unknown as string[], 'Tipo de movimiento inválido')
    .required('El tipo de movimiento es requerido'),
  fromLocationId: Yup.string().nullable().optional(),
  fromBodegaId: Yup.string().nullable().optional(),
  toBodegaId: Yup.string().nullable().optional(),
  reason: Yup.string().nullable().optional(),
  notes: Yup.string().nullable().optional(),
});
