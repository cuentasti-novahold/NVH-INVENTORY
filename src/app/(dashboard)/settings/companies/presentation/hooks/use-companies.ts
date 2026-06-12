'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCompanyAction, updateCompanyAction, deleteCompanyAction } from '../../actions';
import type { CompanyRow, CreateCompanyDTO, UpdateCompanyDTO } from '../dto/company.dto';

export function useCompanies() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateCompanyDTO, onSuccess: (row: CompanyRow) => void) {
    reset();
    start(async () => {
      const r = await createCompanyAction(dto);
      if (r.ok) {
        toast.success('Empresa creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateCompanyDTO, onSuccess: (row: CompanyRow) => void) {
    reset();
    start(async () => {
      const r = await updateCompanyAction(id, dto);
      if (r.ok) {
        toast.success('Empresa actualizada');
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
      const r = await deleteCompanyAction(id);
      if (r.ok) {
        toast.success('Empresa eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
