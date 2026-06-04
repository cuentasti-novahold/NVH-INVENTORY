// Client-safe slice — NO Prisma imports, NO server-only code.
// Safe to import from Client Components.

import type { ColumnDef } from '@/shared/excel-import/types';

export const employeesImportColumns: readonly ColumnDef[] = [
  {
    header: 'Nombre completo*',
    key: 'fullName',
    type: 'string',
    required: true,
    maxLength: 120,
    width: 30,
    example: 'Ana García',
  },
  {
    header: 'Correo*',
    key: 'email',
    type: 'email',
    required: true,
    width: 30,
    example: 'ana@empresa.com',
  },
  {
    header: 'Teléfono',
    key: 'phone',
    type: 'string',
    required: false,
    maxLength: 40,
    width: 18,
    example: '+57 300 123 4567',
  },
  {
    header: 'Cargo',
    key: 'position',
    type: 'string',
    required: false,
    maxLength: 120,
    width: 22,
    example: 'Analista',
  },
  {
    header: 'Departamento',
    key: 'departmentName',
    type: 'string',
    required: false,
    maxLength: 120,
    width: 22,
    example: 'Tecnología',
  },
  {
    header: 'Ciudad',
    key: 'cityName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 20,
    example: 'Bogotá',
  },
  {
    header: 'Sede',
    key: 'locationName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 20,
    example: 'Oficina Principal',
  },
  {
    header: 'Activo',
    key: 'isActive',
    type: 'boolean',
    required: false,
    width: 12,
    example: 'SI',
  },
] as const;

export const employeesImportDisplayName = 'Empleados';
export const employeesImportModuleKey = 'employees';
