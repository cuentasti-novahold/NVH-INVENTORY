import type { EmployeeRow } from '../dto/employee.dto';

type PrismaEmployeeWithRelations = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  departmentId: string | null;
  cityId: string | null;
  locationId: string | null;
  isActive: boolean;
  createdAt: Date;
  department: { name: string } | null;
  city: { name: string } | null;
  location: { name: string } | null;
  _count: { assignments: number };
};

export const employeeInclude = {
  department: { select: { name: true } },
  city: { select: { name: true } },
  location: { select: { name: true } },
  _count: { select: { assignments: true } },
} as const;

export function toEmployeeRow(e: PrismaEmployeeWithRelations): EmployeeRow {
  return {
    id: e.id,
    fullName: e.fullName,
    email: e.email,
    phone: e.phone,
    position: e.position,
    departmentId: e.departmentId,
    departmentName: e.department?.name ?? null,
    cityId: e.cityId,
    cityName: e.city?.name ?? null,
    locationId: e.locationId,
    locationName: e.location?.name ?? null,
    isActive: e.isActive,
    assignmentsCount: e._count.assignments,
    createdAt: e.createdAt.toISOString(),
  };
}
