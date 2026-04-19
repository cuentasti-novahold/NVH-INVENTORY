import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchAssetsAction } from '@/app/(dashboard)/assets/actions';
import { searchEmployeesAction } from '@/app/(dashboard)/employees/actions';

interface BuildCreateFormConfigOpts {
  initialAssetLabel?: string;
  initialEmployeeLabel?: string;
}

export function buildCreateFormConfig(opts: BuildCreateFormConfigOpts = {}): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Activo y empleado',
        fields: [
          {
            name: 'assetId',
            label: 'Activo',
            type: 'autocomplete',
            required: true,
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchAssetsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar activo…',
              minChars: 1,
              initialDisplayValue: opts.initialAssetLabel,
            },
          },
          {
            name: 'employeeId',
            label: 'Empleado',
            type: 'autocomplete',
            required: true,
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchEmployeesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar empleado…',
              minChars: 1,
              initialDisplayValue: opts.initialEmployeeLabel,
            },
          },
        ],
      },
      {
        title: 'Notas',
        fields: [
          { name: 'notes', label: 'Notas', type: 'textarea', gridCols: 1 },
        ],
      },
    ],
  };
}

export function buildAddAssetFormConfig(): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Activo a asignar',
        fields: [
          {
            name: 'assetId',
            label: 'Activo',
            type: 'autocomplete',
            required: true,
            gridCols: 1,
            autocompleteConfig: {
              searchAction: (q) => searchAssetsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Código, marca o modelo…',
              minChars: 1,
            },
          },
          {
            name: 'notes',
            label: 'Notas de entrega',
            type: 'textarea',
            gridCols: 1,
            placeholder: 'Estado del equipo, accesorios incluidos…',
          },
        ],
      },
    ],
  };
}

export function buildReturnFormConfig(): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Devolución',
        fields: [
          { name: 'notes', label: 'Notas de devolución', type: 'textarea', gridCols: 1 },
        ],
      },
    ],
  };
}

interface BuildTransferFormConfigOpts {
  initialEmployeeLabel?: string;
}

export function buildTransferFormConfig(opts: BuildTransferFormConfigOpts = {}): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Nuevo responsable',
        fields: [
          {
            name: 'newEmployeeId',
            label: 'Empleado destino',
            type: 'autocomplete',
            required: true,
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchEmployeesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar empleado…',
              minChars: 1,
              initialDisplayValue: opts.initialEmployeeLabel,
            },
          },
          { name: 'notes', label: 'Notas', type: 'textarea', gridCols: 2 },
        ],
      },
    ],
  };
}
