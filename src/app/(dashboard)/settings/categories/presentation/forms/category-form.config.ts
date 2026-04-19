import { Tag, Layers, GitBranch, FileText, Monitor, Smartphone, HardDrive, Mouse } from 'lucide-react';
import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchCategoriesAction } from '../../actions';

export function buildCategoryFormConfig(opts: {
  excludeIdForParent?: string;
  prefixLocked?: boolean;
  initialParentLabel?: string;
}): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Identificación',
        icon: Tag,
        accent: 'bg-blue-500',
        fields: [
          {
            name: 'name',
            label: 'Nombre',
            type: 'text',
            required: true,
            gridCols: 1,
            maxLength: 80,
            placeholder: 'Computador Portátil',
          },
          {
            name: 'prefix',
            label: opts.prefixLocked ? 'Prefijo (bloqueado)' : 'Prefijo',
            type: 'text',
            required: true,
            gridCols: 2,
            maxLength: 6,
            placeholder: 'PC, MON, PHN…',
            pattern: { regex: '^[A-Z0-9]{2,6}$', message: '2-6 caracteres, mayúsculas o dígitos' },
            hidden: opts.prefixLocked,
          },
          {
            name: 'prefix_locked',
            label: 'Prefijo (bloqueado)',
            type: 'text',
            gridCols: 2,
            hidden: !opts.prefixLocked,
          },
          {
            name: 'defaultUsefulLife',
            label: 'Vida útil (años)',
            type: 'number',
            gridCols: 2,
            min: 1,
            max: 50,
            placeholder: '5',
          },
        ],
      },
      {
        title: 'Tipo de equipo',
        icon: Layers,
        accent: 'bg-violet-500',
        description: 'Define qué campos técnicos aparecen al registrar activos de esta categoría.',
        fields: [
          {
            name: 'fieldConfigTemplate',
            label: 'Tipo de equipo',
            type: 'preset-selector',
            required: true,
            gridCols: 1,
            presetSelectorConfig: {
              presets: [
                {
                  value: 'computer',
                  label: 'Equipo de cómputo',
                  sub: 'PC, laptop, escritorio',
                  icon: Monitor,
                  accent: 'text-blue-600 dark:text-blue-400',
                  accentBg: 'bg-blue-500',
                  fields: 'Procesador · RAM · Almacenamiento · SO',
                },
                {
                  value: 'phone',
                  label: 'Celular',
                  sub: 'Dispositivo móvil empresarial',
                  icon: Smartphone,
                  accent: 'text-violet-600 dark:text-violet-400',
                  accentBg: 'bg-violet-500',
                  fields: 'Número · IMEI · Almacenamiento',
                },
                {
                  value: 'storage',
                  label: 'Disco externo',
                  sub: 'Almacenamiento externo',
                  icon: HardDrive,
                  accent: 'text-emerald-600 dark:text-emerald-400',
                  accentBg: 'bg-emerald-600',
                  fields: 'Capacidad · Tipo de disco',
                },
                {
                  value: 'peripheral',
                  label: 'Periférico / accesorio',
                  sub: 'Mouse, teclado, monitor, silla…',
                  icon: Mouse,
                  accent: 'text-slate-600 dark:text-slate-400',
                  accentBg: 'bg-slate-500',
                  fields: 'Solo identificación básica',
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Jerarquía',
        icon: GitBranch,
        accent: 'bg-slate-500',
        description: 'Opcional — permite organizar categorías en árbol.',
        fields: [
          {
            name: 'parentId',
            label: 'Categoría padre',
            type: 'autocomplete',
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) =>
                searchCategoriesAction(q, opts.excludeIdForParent).then((r) =>
                  r.ok ? r.data : [],
                ),
              returnMode: 'code',
              placeholder: 'Buscar categoría…',
              minChars: 1,
              initialDisplayValue: opts.initialParentLabel,
            },
          },
        ],
      },
      {
        title: 'Descripción',
        icon: FileText,
        accent: 'bg-amber-500',
        fields: [
          {
            name: 'description',
            label: 'Descripción',
            type: 'textarea',
            gridCols: 1,
            maxLength: 500,
            placeholder: 'Descripción opcional de esta categoría…',
          },
        ],
      },
    ],
  };
}
