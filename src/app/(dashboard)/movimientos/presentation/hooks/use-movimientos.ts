'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createMovementAction, deleteMovementAction } from '../../actions';
import type { MovementRow, CreateMovementDTO } from '../dto/movement.dto';

export function useMovimientos() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => setFieldErrors({});

  function create(dto: CreateMovementDTO, onSuccess: (row: MovementRow) => void) {
    reset();
    start(async () => {
      const r = await createMovementAction(dto);
      if (r.ok) {
        toast.success('Traslado registrado');
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
      const r = await deleteMovementAction(id);
      if (r.ok) {
        toast.success('Traslado eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, remove };
}
