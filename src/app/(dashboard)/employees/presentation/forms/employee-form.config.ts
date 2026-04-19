import type { FormConfig } from '@/shared/presentation/types/form-config.types';
import { searchDepartmentsAction } from '../../actions';
import {
  searchCitiesAction,
  searchLocationsAction,
} from '@/app/(dashboard)/settings/locations/actions';

interface BuildEmployeeFormConfigOpts {
  initialDeptLabel?: string;
  initialCityLabel?: string;
  initialLocationLabel?: string;
}

export function buildEmployeeFormConfig(opts: BuildEmployeeFormConfigOpts): FormConfig {
  return {
    fields: [],
    sections: [
      {
        title: 'Datos personales',
        fields: [
          {
            name: 'fullName',
            label: 'Nombre completo',
            type: 'text',
            required: true,
            gridCols: 2,
            maxLength: 120,
          },
          {
            name: 'email',
            label: 'Correo',
            type: 'text',
            required: true,
            gridCols: 2,
            maxLength: 160,
          },
          {
            name: 'phone',
            label: 'Teléfono',
            type: 'text',
            gridCols: 2,
            maxLength: 40,
          },
          {
            name: 'position',
            label: 'Cargo',
            type: 'text',
            gridCols: 2,
            maxLength: 120,
          },
        ],
      },
      {
        title: 'Organización',
        fields: [
          {
            name: 'departmentId',
            label: 'Departamento',
            type: 'autocomplete',
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchDepartmentsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar o crear departamento…',
              minChars: 0,
              initialDisplayValue: opts.initialDeptLabel,
            },
          },
          {
            name: 'isActive',
            label: 'Activo',
            type: 'switch',
            gridCols: 2,
          },
        ],
      },
      {
        title: 'Ubicación',
        fields: [
          {
            name: 'cityId',
            label: 'Ciudad',
            type: 'autocomplete',
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchCitiesAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar ciudad…',
              minChars: 1,
              initialDisplayValue: opts.initialCityLabel,
            },
          },
          {
            name: 'locationId',
            label: 'Sede',
            type: 'autocomplete',
            gridCols: 2,
            autocompleteConfig: {
              searchAction: (q) => searchLocationsAction(q).then((r) => (r.ok ? r.data : [])),
              returnMode: 'code',
              placeholder: 'Buscar sede…',
              minChars: 1,
              initialDisplayValue: opts.initialLocationLabel,
            },
          },
        ],
      },
    ],
  };
}
