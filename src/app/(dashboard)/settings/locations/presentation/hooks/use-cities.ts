'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCityAction, updateCityAction, deleteCityAction } from '../../actions';
import type { CityRow, CreateCityDTO, UpdateCityDTO } from '../dto/city.dto';

export function useCities() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateCityDTO, onSuccess: (row: CityRow) => void) {
    reset();
    start(async () => {
      const r = await createCityAction(dto);
      if (r.ok) {
        toast.success('Ciudad creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateCityDTO, onSuccess: (row: CityRow) => void) {
    reset();
    start(async () => {
      const r = await updateCityAction(id, dto);
      if (r.ok) {
        toast.success('Ciudad actualizada');
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
      const r = await deleteCityAction(id);
      if (r.ok) {
        toast.success('Ciudad eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
