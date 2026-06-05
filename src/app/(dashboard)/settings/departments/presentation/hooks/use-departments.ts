'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createDepartmentAction, updateDepartmentAction, deleteDepartmentAction } from '../../actions';
import type { DepartmentRow, CreateDepartmentDTO, UpdateDepartmentDTO } from '../dto/department.dto';

export function useDepartments() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateDepartmentDTO, onSuccess: (row: DepartmentRow) => void) {
    reset();
    start(async () => {
      const r = await createDepartmentAction(dto);
      if (r.ok) {
        toast.success('Departamento creado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateDepartmentDTO, onSuccess: (row: DepartmentRow) => void) {
    reset();
    start(async () => {
      const r = await updateDepartmentAction(id, dto);
      if (r.ok) {
        toast.success('Departamento actualizado');
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
      const r = await deleteDepartmentAction(id);
      if (r.ok) {
        toast.success('Departamento eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
