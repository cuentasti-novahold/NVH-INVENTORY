'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCurrencyAction, updateCurrencyAction, deleteCurrencyAction } from '../../actions';
import type { CurrencyRow, CreateCurrencyDTO, UpdateCurrencyDTO } from '../dto/currency.dto';

export function useCurrencies() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateCurrencyDTO, onSuccess: (row: CurrencyRow) => void) {
    reset();
    start(async () => {
      const r = await createCurrencyAction(dto);
      if (r.ok) {
        toast.success('Moneda creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateCurrencyDTO, onSuccess: (row: CurrencyRow) => void) {
    reset();
    start(async () => {
      const r = await updateCurrencyAction(id, dto);
      if (r.ok) {
        toast.success('Moneda actualizada');
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
      const r = await deleteCurrencyAction(id);
      if (r.ok) {
        toast.success('Moneda eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
