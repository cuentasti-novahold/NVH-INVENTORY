import type { AssignmentRow, AssignmentStatus, EmployeeAssignmentRow } from '../dto/assignment.dto';

type PrismaAssignmentWithRelations = {
  id: string;
  assetId: string;
  employeeId: string;
  deliveredById: string | null;
  status: string;
  assignedAt: Date;
  returnedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  asset: {
    assetCode: string;
    brand: string | null;
    model: string | null;
  };
  employee: {
    fullName: string;
    email: string;
  };
  deliveredBy: { name: string | null } | null;
};

export const assignmentInclude = {
  asset: { select: { assetCode: true, brand: true, model: true } },
  employee: { select: { fullName: true, email: true } },
  deliveredBy: { select: { name: true } },
} as const;

export type PrismaEmployeeWithAssignmentStats = {
  id: string;
  fullName: string;
  email: string;
  department: { name: string } | null;
  location: { name: string } | null;
  assignments: Array<{ status: string; assignedAt: Date; returnedAt: Date | null }>;
};

export function toEmployeeAssignmentRow(e: PrismaEmployeeWithAssignmentStats): EmployeeAssignmentRow {
  const active = e.assignments.filter((a) => a.status === 'ACTIVE');
  const closed = e.assignments.filter((a) => a.status !== 'ACTIVE');

  let lastAssignedAt: string | null = null;
  if (active.length > 0) {
    lastAssignedAt = new Date(Math.max(...active.map((a) => a.assignedAt.getTime()))).toISOString();
  }

  let lastReturnedAt: string | null = null;
  const returnedTimes = closed.map((a) => a.returnedAt?.getTime()).filter((t): t is number => t != null);
  if (returnedTimes.length > 0) {
    lastReturnedAt = new Date(Math.max(...returnedTimes)).toISOString();
  }

  return {
    employeeId: e.id,
    employeeName: e.fullName,
    employeeEmail: e.email,
    employeeDepartment: e.department?.name ?? null,
    employeeLocation: e.location?.name ?? null,
    activeCount: active.length,
    lastAssignedAt,
    lastReturnedAt,
  };
}

export function toAssignmentRow(a: PrismaAssignmentWithRelations): AssignmentRow {
  return {
    id: a.id,
    assetId: a.assetId,
    assetCode: a.asset.assetCode,
    assetLabel:
      [a.asset.brand, a.asset.model].filter(Boolean).join(' ') || a.asset.assetCode,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    employeeEmail: a.employee.email,
    status: a.status as AssignmentStatus,
    assignedAt: a.assignedAt.toISOString(),
    returnedAt: a.returnedAt?.toISOString() ?? null,
    deliveredById: a.deliveredById ?? null,
    deliveredByName: a.deliveredBy?.name ?? null,
    notes: a.notes ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
