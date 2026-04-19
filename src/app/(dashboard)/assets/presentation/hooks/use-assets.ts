'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  createAssetAction,
  updateAssetAction,
  deactivateAssetAction,
  deleteAssetAction,
} from '../../actions';
import type { AssetRow, CreateAssetDTO, UpdateAssetDTO } from '../dto/asset.dto';

export function useAssets() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => setFieldErrors({});

  function create(dto: CreateAssetDTO, onSuccess: (row: AssetRow) => void) {
    reset();
    start(async () => {
      const r = await createAssetAction(dto);
      if (r.ok) {
        toast.success('Activo creado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateAssetDTO, onSuccess: (row: AssetRow) => void) {
    reset();
    start(async () => {
      const r = await updateAssetAction(id, dto);
      if (r.ok) {
        toast.success('Activo actualizado');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function deactivate(id: string, onSuccess: () => void) {
    reset();
    start(async () => {
      const r = await deactivateAssetAction(id);
      if (r.ok) {
        toast.success('Activo desactivado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  function remove(id: string, onSuccess: () => void) {
    reset();
    start(async () => {
      const r = await deleteAssetAction(id);
      if (r.ok) {
        toast.success('Activo eliminado');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, deactivate, remove };
}
