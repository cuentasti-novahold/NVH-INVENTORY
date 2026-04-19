'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createLocationAction, updateLocationAction, deleteLocationAction } from '../../actions';
import type { LocationRow, CreateLocationDTO, UpdateLocationDTO } from '../dto/location.dto';

export function useLocations() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateLocationDTO, onSuccess: (row: LocationRow) => void) {
    reset();
    start(async () => {
      const r = await createLocationAction(dto);
      if (r.ok) {
        toast.success('Sede creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateLocationDTO, onSuccess: (row: LocationRow) => void) {
    reset();
    start(async () => {
      const r = await updateLocationAction(id, dto);
      if (r.ok) {
        toast.success('Sede actualizada');
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
      const r = await deleteLocationAction(id);
      if (r.ok) {
        toast.success('Sede eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
