import type { DepartmentRow } from '../dto/department.dto';

type DepartmentWithRelations = {
  id: string;
  name: string;
  createdAt: Date;
  _count: { employees: number };
};

export const departmentInclude = {
  _count: { select: { employees: true } },
} as const;

export function toDepartmentRow(d: DepartmentWithRelations): DepartmentRow {
  return {
    id: d.id,
    name: d.name,
    employeesCount: d._count.employees,
    createdAt: d.createdAt.toISOString(),
  };
}
