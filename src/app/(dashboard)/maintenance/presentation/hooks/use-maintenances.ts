'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  createMaintenanceAction,
  updateMaintenanceAction,
  deleteMaintenanceAction,
} from '../../actions';
import type { MaintenanceRow, CreateMaintenanceDTO, UpdateMaintenanceDTO } from '../dto/maintenance.dto';

export function useMaintenances() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => setFieldErrors({});

  function create(dto: CreateMaintenanceDTO, onSuccess: (row: MaintenanceRow) => void) {
    reset();
    start(async () => {
      const r = await createMaintenanceAction(dto);
      if (r.ok) {
        toast.success('Mantenimiento registrado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateMaintenanceDTO, onSuccess: (row: MaintenanceRow) => void) {
    reset();
    start(async () => {
      const r = await updateMaintenanceAction(id, dto);
      if (r.ok) {
        toast.success('Mantenimiento actualizado');
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
      const r = await deleteMaintenanceAction(id);
      if (r.ok) {
        toast.success('Mantenimiento eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
