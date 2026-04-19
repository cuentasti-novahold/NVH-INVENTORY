'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  createAssignmentAction,
  returnAssignmentAction,
  transferAssignmentAction,
  deleteAssignmentAction,
} from '../../actions';
import type {
  AssignmentRow,
  CreateAssignmentDTO,
  ReturnAssignmentDTO,
  TransferAssignmentDTO,
} from '../dto/assignment.dto';

export function useAssignments() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => setFieldErrors({});

  function create(dto: CreateAssignmentDTO, onSuccess: (row: AssignmentRow) => void) {
    reset();
    start(async () => {
      const r = await createAssignmentAction(dto);
      if (r.ok) {
        toast.success('Asignación creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function return_(id: string, dto: ReturnAssignmentDTO, onSuccess: (row: AssignmentRow) => void) {
    reset();
    start(async () => {
      const r = await returnAssignmentAction(id, dto);
      if (r.ok) {
        toast.success('Activo devuelto');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function transfer(
    id: string,
    dto: TransferAssignmentDTO,
    onSuccess: (row: AssignmentRow) => void,
  ) {
    reset();
    start(async () => {
      const r = await transferAssignmentAction(id, dto);
      if (r.ok) {
        toast.success('Activo transferido');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function remove(id: string, onSuccess: () => void) {
    reset();
    start(async () => {
      const r = await deleteAssignmentAction(id);
      if (r.ok) {
        toast.success('Asignación eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, return_, transfer, remove };
}
