'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ExcelImportResult } from '@/shared/ui/types/excel-import.types';
import {
  createEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
  deactivateEmployeeAction,
  importEmployeesAction,
} from '../../actions';
import type { EmployeeRow, CreateEmployeeDTO, UpdateEmployeeDTO, EmployeeImportRow } from '../dto/employee.dto';

export function useEmployees() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => setFieldErrors({});

  function create(dto: CreateEmployeeDTO, onSuccess: (row: EmployeeRow) => void) {
    reset();
    start(async () => {
      const r = await createEmployeeAction(dto);
      if (r.ok) {
        toast.success('Empleado creado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateEmployeeDTO, onSuccess: (row: EmployeeRow) => void) {
    reset();
    start(async () => {
      const r = await updateEmployeeAction(id, dto);
      if (r.ok) {
        toast.success('Empleado actualizado');
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
      const r = await deleteEmployeeAction(id);
      if (r.ok) {
        toast.success('Empleado eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  function deactivate(id: string, onSuccess: () => void) {
    reset();
    start(async () => {
      const r = await deactivateEmployeeAction(id);
      if (r.ok) {
        toast.success('Empleado desactivado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  function importRows(rows: EmployeeImportRow[], onSuccess: (result: ExcelImportResult) => void) {
    reset();
    start(async () => {
      const r = await importEmployeesAction(rows);
      if (r.ok) {
        toast.success(`Importación: ${r.data.inserted} insertados, ${r.data.skipped} omitidos`);
        onSuccess(r.data);
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove, deactivate, importRows };
}
