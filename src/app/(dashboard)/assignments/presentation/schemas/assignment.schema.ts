import * as yup from 'yup';
import type { CreateAssignmentDTO, ReturnAssignmentDTO, TransferAssignmentDTO } from '../dto/assignment.dto';

export const createAssignmentSchema: yup.ObjectSchema<CreateAssignmentDTO> = yup.object({
  assetId: yup.string().required('El activo es requerido'),
  employeeId: yup.string().required('El empleado es requerido'),
  notes: yup.string().nullable().optional(),
});

export const returnAssignmentSchema: yup.ObjectSchema<ReturnAssignmentDTO> = yup.object({
  notes: yup.string().nullable().optional(),
});

export const transferAssignmentSchema: yup.ObjectSchema<TransferAssignmentDTO> = yup.object({
  newEmployeeId: yup.string().required('El nuevo empleado es requerido'),
  notes: yup.string().nullable().optional(),
});
