// Server-only — imports Prisma. Do NOT import this file from Client Components.

import type { ExcelImportConfig } from '@/shared/excel-import/types';
import { prisma } from '@/lib/prisma';
import {
  employeesImportColumns,
  employeesImportDisplayName,
  employeesImportModuleKey,
} from './config.client';
import { bulkCreateEmployees } from './bulk-create';

export interface EmployeeImportRow {
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  departmentName: string | null;
  cityName: string | null;
  locationName: string | null;
  isActive: boolean;
}

export const employeesImportConfig: ExcelImportConfig<EmployeeImportRow> = {
  moduleKey: employeesImportModuleKey,
  displayName: employeesImportDisplayName,
  entity: 'Employee',
  sheetName: 'Empleados',
  maxRows: 5000,
  columns: [...employeesImportColumns],

  masterValidations: [
    {
      key: 'departmentName',
      lookup: async (values) => {
        const rows = await prisma.department.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Departamento no existe',
    },
    {
      key: 'cityName',
      lookup: async (values) => {
        const rows = await prisma.city.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Ciudad no existe',
    },
    {
      key: 'locationName',
      lookup: async (values) => {
        const rows = await prisma.location.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Sede no existe',
    },
  ],

  rowTransformer: (flat): EmployeeImportRow => {
    const trimOrNull = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    const parseBool = (v: unknown): boolean => {
      if (v == null || v === '') return true; // default-active to match DB default
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      return !(s === 'no' || s === 'false' || s === '0' || s === 'inactivo');
    };

    return {
      fullName: String(flat.fullName).trim(),
      email: String(flat.email).trim().toLowerCase(),
      phone: trimOrNull(flat.phone),
      position: trimOrNull(flat.position),
      departmentName: trimOrNull(flat.departmentName),
      cityName: trimOrNull(flat.cityName),
      locationName: trimOrNull(flat.locationName),
      isActive: parseBool(flat.isActive),
    };
  },

  handler: bulkCreateEmployees,
};
