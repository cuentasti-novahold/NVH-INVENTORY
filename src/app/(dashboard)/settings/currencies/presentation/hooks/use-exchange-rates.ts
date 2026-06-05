'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createExchangeRateAction } from '../../actions';
import type { ExchangeRateRow, CreateExchangeRateDTO } from '../dto/exchange-rate.dto';

export function useExchangeRates() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateExchangeRateDTO, onSuccess: (row: ExchangeRateRow) => void) {
    reset();
    start(async () => {
      const r = await createExchangeRateAction(dto);
      if (r.ok) {
        toast.success('Tasa de cambio registrada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create };
}
