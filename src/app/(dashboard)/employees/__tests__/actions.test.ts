// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    employee: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    department: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    city: {
      findFirst: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
    importLog: {
      create: vi.fn(),
    },
    assignment: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  listEmployeesAction,
  searchEmployeesAction,
  searchDepartmentsAction,
  createEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
  deactivateEmployeeAction,
  getEmployeeAssignmentReportAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockEmployee = prisma.employee as Record<string, ReturnType<typeof vi.fn>>;
const mockDepartment = prisma.department as Record<string, ReturnType<typeof vi.fn>>;
const mockCity = prisma.city as Record<string, ReturnType<typeof vi.fn>>;
const mockLocation = prisma.location as Record<string, ReturnType<typeof vi.fn>>;
const mockImportLog = prisma.importLog as Record<string, ReturnType<typeof vi.fn>>;
const mockAssignment = prisma.assignment as Record<string, ReturnType<typeof vi.fn>>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

function makeSession(role: string) {
  return { user: { id: 'user-1', role } };
}

const sampleEmployee = {
  id: 'emp-1',
  fullName: 'Carlos Velasco',
  email: 'carlos@novahold.com',
  phone: null,
  position: 'Dev',
  departmentId: null,
  cityId: null,
  locationId: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  department: null,
  city: null,
  location: null,
  _count: { assignments: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockImportLog.create.mockResolvedValue({});
});

// ─── listEmployeesAction ──────────────────────────────────────────────────────

describe('listEmployeesAction', () => {
  it('returns FORBIDDEN when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await listEmployeesAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for TECHNICIAN (no employees:read)', async () => {
    mockAuth.mockResolvedValue(makeSession('TECHNICIAN'));
    const result = await listEmployeesAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns ok with cursor-paginated rows for VIEWER', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[sampleEmployee], 1]);
    const result = await listEmployeesAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].email).toBe('carlos@novahold.com');
      expect(result.data.rows[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.data.pageInfo.hasNextPage).toBe(false);
      expect(result.data.pageInfo.hasPreviousPage).toBe(false);
    }
  });

  it('detects hasNextPage when extra row returned', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findUnique.mockResolvedValue(null);
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...sampleEmployee, id: `emp-${i}` }));
    mockTransaction.mockResolvedValue([rows, 25]);
    const result = await listEmployeesAction({ pageSize: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toHaveLength(20);
      expect(result.data.pageInfo.hasNextPage).toBe(true);
    }
  });

  it('filters by isActive=inactive when param is "inactive"', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.findUnique.mockResolvedValue(null);
    mockEmployee.findMany.mockResolvedValue([]);
    mockEmployee.count.mockResolvedValue(0);
    mockTransaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    await listEmployeesAction({ isActive: 'inactive' });
    const findManyCall = mockEmployee.findMany.mock.calls[0][0];
    expect(findManyCall.where.isActive).toBe(false);
  });

  it('omits isActive filter when param is "all"', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.findUnique.mockResolvedValue(null);
    mockEmployee.findMany.mockResolvedValue([]);
    mockEmployee.count.mockResolvedValue(0);
    mockTransaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    await listEmployeesAction({ isActive: 'all' });
    const findManyCall = mockEmployee.findMany.mock.calls[0][0];
    expect(findManyCall.where.isActive).toBeUndefined();
  });
});

// ─── searchEmployeesAction ────────────────────────────────────────────────────

describe('searchEmployeesAction', () => {
  it('returns UNAUTHORIZED when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await searchEmployeesAction('carlos');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns items shaped { code: id, value: "Name — email" }', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findMany.mockResolvedValue([
      { id: 'emp-1', fullName: 'Carlos Velasco', email: 'carlos@novahold.com' },
    ]);
    const result = await searchEmployeesAction('carlos');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({
        code: 'emp-1',
        value: 'Carlos Velasco — carlos@novahold.com',
      });
    }
  });
});

// ─── searchDepartmentsAction ──────────────────────────────────────────────────

describe('searchDepartmentsAction', () => {
  it('returns UNAUTHORIZED when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await searchDepartmentsAction('TI');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns departments shaped { code: id, value: name }', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockDepartment.findMany.mockResolvedValue([{ id: 'dept-1', name: 'Tecnología' }]);
    const result = await searchDepartmentsAction('tec');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: 'dept-1', value: 'Tecnología' });
    }
  });
});

// ─── createEmployeeAction ─────────────────────────────────────────────────────

describe('createEmployeeAction', () => {
  it('returns FORBIDDEN for VIEWER (no employees:create)', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    const result = await createEmployeeAction({ fullName: 'Ana', email: 'ana@novahold.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION with fieldErrors.fullName when fullName is empty', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const result = await createEmployeeAction({ fullName: '', email: 'ana@novahold.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.fullName).toBeDefined();
    }
  });

  it('returns VALIDATION with fieldErrors.email when email is invalid', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const result = await createEmployeeAction({ fullName: 'Ana López', email: 'not-an-email' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.email).toBeDefined();
    }
  });

  it('returns CONFLICT with fieldErrors.email on P2002 email duplicate', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
    const result = await createEmployeeAction({ fullName: 'Ana López', email: 'ana@novahold.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.fieldErrors?.email).toBeDefined();
    }
  });

  it('happy path: creates employee and returns ok with mapped row', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockResolvedValue(sampleEmployee);
    const result = await createEmployeeAction({ fullName: 'Carlos Velasco', email: 'carlos@novahold.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.email).toBe('carlos@novahold.com');
      expect(result.data.fullName).toBe('Carlos Velasco');
    }
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });

  it('auto-upserts department when departmentName is provided and departmentId is absent', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        department: { upsert: vi.fn().mockResolvedValue({ id: 'dept-new' }) },
        employee: { create: vi.fn().mockResolvedValue(sampleEmployee) },
      };
      return fn(tx as unknown as typeof prisma);
    });
    const result = await createEmployeeAction({
      fullName: 'Ana López',
      email: 'ana@novahold.com',
      departmentName: 'Nuevas Tecnologías',
    });
    expect(result.ok).toBe(true);
  });
});

// ─── updateEmployeeAction ─────────────────────────────────────────────────────

describe('updateEmployeeAction', () => {
  it('returns NOT_FOUND when Prisma throws P2025', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockRejectedValue({ code: 'P2025' });
    const result = await updateEmployeeAction('emp-1', { fullName: 'Nuevo' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('happy path: updates and returns mapped row', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const updated = { ...sampleEmployee, fullName: 'Nuevo Nombre' };
    mockTransaction.mockResolvedValue(updated);
    const result = await updateEmployeeAction('emp-1', { fullName: 'Nuevo Nombre' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.fullName).toBe('Nuevo Nombre');
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });
});

// ─── deleteEmployeeAction ─────────────────────────────────────────────────────

describe('deleteEmployeeAction', () => {
  it('returns NOT_FOUND when employee does not exist', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.findUnique.mockResolvedValue(null);
    const result = await deleteEmployeeAction('emp-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('returns HAS_CHILDREN when assignments > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.findUnique.mockResolvedValue({ _count: { assignments: 3 } });
    const result = await deleteEmployeeAction('emp-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });

  it('happy path: deletes and revalidates when no assignments', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.findUnique.mockResolvedValue({ _count: { assignments: 0 } });
    mockEmployee.delete.mockResolvedValue({});
    const result = await deleteEmployeeAction('emp-1');
    expect(result.ok).toBe(true);
    expect(mockEmployee.delete).toHaveBeenCalledWith({ where: { id: 'emp-1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });
});

// ─── deactivateEmployeeAction ─────────────────────────────────────────────────

describe('deactivateEmployeeAction', () => {
  it('returns NOT_FOUND when Prisma throws P2025', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.update.mockRejectedValue({ code: 'P2025' });
    const result = await deactivateEmployeeAction('emp-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('sets isActive=false and revalidates on success', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockEmployee.update.mockResolvedValue({});
    const result = await deactivateEmployeeAction('emp-1');
    expect(result.ok).toBe(true);
    expect(mockEmployee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { isActive: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });
});

// ─── getEmployeeAssignmentReportAction ────────────────────────────────────────

const sampleEmployeeFull = {
  id: 'emp-abc12345',
  fullName: 'Laura Gómez',
  email: 'laura@novahold.com',
  phone: '3001234567',
  position: 'Analista TI',
  department: { name: 'Tecnología' },
  city: { name: 'Bogotá' },
  location: { name: 'Sede Norte' },
};

const sampleAssignment = {
  id: 'asgn-1',
  assignedAt: new Date('2024-03-01T00:00:00.000Z'),
  notes: 'Equipo nuevo',
  asset: {
    assetCode: 'NVH-LAP-00001',
    brand: 'Dell',
    model: 'Latitude 5420',
    serialNumber: 'SN123',
    generalStatus: 'GOOD',
    category: { name: 'Laptop' },
  },
  deliveredBy: { name: 'Carlos Admin' },
};

describe('getEmployeeAssignmentReportAction', () => {
  it('returns FORBIDDEN when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getEmployeeAssignmentReportAction('emp-abc12345');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for TECHNICIAN (no employees:read)', async () => {
    mockAuth.mockResolvedValue(makeSession('TECHNICIAN'));
    const result = await getEmployeeAssignmentReportAction('emp-abc12345');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for unknown employeeId', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findUnique.mockResolvedValue(null);
    mockAssignment.findMany.mockResolvedValue([]);
    const result = await getEmployeeAssignmentReportAction('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('returns ok with empty assignments array when no ACTIVE assignments', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findUnique.mockResolvedValue(sampleEmployeeFull);
    mockAssignment.findMany.mockResolvedValue([]);
    const result = await getEmployeeAssignmentReportAction('emp-abc12345');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.assignments).toHaveLength(0);
      expect(result.data.employee.fullName).toBe('Laura Gómez');
    }
  });

  it('returns ok with correctly mapped assignment data for VIEWER', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockEmployee.findUnique.mockResolvedValue(sampleEmployeeFull);
    mockAssignment.findMany.mockResolvedValue([sampleAssignment]);
    const result = await getEmployeeAssignmentReportAction('emp-abc12345');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.employee.fullName).toBe('Laura Gómez');
      expect(result.data.employee.departmentName).toBe('Tecnología');
      expect(result.data.employee.cityName).toBe('Bogotá');
      expect(result.data.employee.locationName).toBe('Sede Norte');
      expect(result.data.assignments).toHaveLength(1);
      const a = result.data.assignments[0];
      expect(a.assetCode).toBe('NVH-LAP-00001');
      expect(a.categoryName).toBe('Laptop');
      expect(a.brand).toBe('Dell');
      expect(a.model).toBe('Latitude 5420');
      expect(a.serialNumber).toBe('SN123');
      expect(a.generalStatus).toBe('GOOD');
      expect(a.assignedAt).toBe('2024-03-01T00:00:00.000Z');
      expect(a.deliveredByName).toBe('Carlos Admin');
      expect(a.notes).toBe('Equipo nuevo');
    }
  });
});

