'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createBodegaAction, updateBodegaAction, deleteBodegaAction } from '../../actions';
import type { BodegaRow, CreateBodegaDTO, UpdateBodegaDTO } from '../dto/bodega.dto';

export function useBodegas() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateBodegaDTO, onSuccess: (row: BodegaRow) => void) {
    reset();
    start(async () => {
      const r = await createBodegaAction(dto);
      if (r.ok) {
        toast.success('Bodega creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateBodegaDTO, onSuccess: (row: BodegaRow) => void) {
    reset();
    start(async () => {
      const r = await updateBodegaAction(id, dto);
      if (r.ok) {
        toast.success('Bodega actualizada');
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
      const r = await deleteBodegaAction(id);
      if (r.ok) {
        toast.success('Bodega eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
