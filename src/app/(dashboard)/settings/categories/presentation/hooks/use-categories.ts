'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '../../actions';
import type { CategoryRow, CreateCategoryDTO, UpdateCategoryDTO } from '../dto/category.dto';

export function useCategories() {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setFieldErrors({});
  }

  function create(dto: CreateCategoryDTO, onSuccess: (row: CategoryRow) => void) {
    reset();
    start(async () => {
      const r = await createCategoryAction(dto);
      if (r.ok) {
        toast.success('Categoría creada');
        onSuccess(r.data);
      } else {
        setFieldErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });
  }

  function update(id: string, dto: UpdateCategoryDTO, onSuccess: (row: CategoryRow) => void) {
    reset();
    start(async () => {
      const r = await updateCategoryAction(id, dto);
      if (r.ok) {
        toast.success('Categoría actualizada');
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
      const r = await deleteCategoryAction(id);
      if (r.ok) {
        toast.success('Categoría eliminada');
        onSuccess();
      } else {
        toast.error(r.message);
      }
    });
  }

  return { pending, fieldErrors, create, update, remove };
}
