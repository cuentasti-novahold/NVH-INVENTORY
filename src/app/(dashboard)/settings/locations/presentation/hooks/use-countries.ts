'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCountryAction, updateCountryAction, deleteCountryAction } from '../../actions';
import type { CountryRow, CreateCountryDTO, UpdateCountryDTO } from '../dto/country.dto';

export function useCountries() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateCountryDTO, onSuccess: (row: CountryRow) => void) {
    reset();
    start(async () => {
      const r = await createCountryAction(dto);
      if (r.ok) {
        toast.success('País creado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateCountryDTO, onSuccess: (row: CountryRow) => void) {
    reset();
    start(async () => {
      const r = await updateCountryAction(id, dto);
      if (r.ok) {
        toast.success('País actualizado');
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
      const r = await deleteCountryAction(id);
      if (r.ok) {
        toast.success('País eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
