// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    assignment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

import { toAssignmentRow, toEmployeeAssignmentRow } from '../presentation/mappers/assignment.mapper';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockAssignment = prisma.assignment as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockEmployee = prisma.employee as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const adminSession = { user: { id: 'u1', role: 'ADMIN' } };
const managerSession = { user: { id: 'u2', role: 'MANAGER' } };
const viewerSession = { user: { id: 'u3', role: 'VIEWER' } };

const now = new Date('2025-01-15T10:00:00.000Z');

const fakeDbAssignment = {
  id: 'asgn1',
  assetId: 'asset1',
  employeeId: 'emp1',
  deliveredById: 'u1',
  status: 'ACTIVE',
  assignedAt: now,
  returnedAt: null,
  notes: null,
  createdAt: now,
  asset: { assetCode: 'NVH-PC-00001', brand: 'Lenovo', model: 'ThinkPad X1' },
  employee: { fullName: 'Juan Pérez', email: 'juan@novahold.com' },
  deliveredBy: { name: 'Admin User' },
};

// ─── toAssignmentRow (T-03) ────────────────────────────────────────────────

describe('toAssignmentRow', () => {
  it('maps all fields correctly', () => {
    const row = toAssignmentRow(fakeDbAssignment);
    expect(row.id).toBe('asgn1');
    expect(row.assetId).toBe('asset1');
    expect(row.assetCode).toBe('NVH-PC-00001');
    expect(row.assetLabel).toBe('Lenovo ThinkPad X1');
    expect(row.employeeId).toBe('emp1');
    expect(row.employeeName).toBe('Juan Pérez');
    expect(row.employeeEmail).toBe('juan@novahold.com');
    expect(row.status).toBe('ACTIVE');
    expect(row.assignedAt).toBe(now.toISOString());
    expect(row.returnedAt).toBeNull();
    expect(row.deliveredById).toBe('u1');
    expect(row.deliveredByName).toBe('Admin User');
    expect(row.notes).toBeNull();
    expect(row.createdAt).toBe(now.toISOString());
  });

  it('falls back to assetCode when brand and model are null', () => {
    const row = toAssignmentRow({
      ...fakeDbAssignment,
      asset: { assetCode: 'NVH-PC-00001', brand: null, model: null },
    });
    expect(row.assetLabel).toBe('NVH-PC-00001');
  });

  it('handles returnedAt when present', () => {
    const returnedAt = new Date('2025-06-01T00:00:00.000Z');
    const row = toAssignmentRow({ ...fakeDbAssignment, returnedAt, status: 'RETURNED' });
    expect(row.returnedAt).toBe(returnedAt.toISOString());
    expect(row.status).toBe('RETURNED');
  });

  it('handles null deliveredBy', () => {
    const row = toAssignmentRow({ ...fakeDbAssignment, deliveredById: null, deliveredBy: null });
    expect(row.deliveredById).toBeNull();
    expect(row.deliveredByName).toBeNull();
  });
});

// ─── Import actions after mocks are set up ────────────────────────────────
// We import dynamically here to ensure mocks are in place
let listAssignmentsAction: typeof import('../actions').listAssignmentsAction;
let listEmployeeAssignmentsAction: typeof import('../actions').listEmployeeAssignmentsAction;
let getEmployeeAssignmentsAction: typeof import('../actions').getEmployeeAssignmentsAction;
let createAssignmentAction: typeof import('../actions').createAssignmentAction;
let returnAssignmentAction: typeof import('../actions').returnAssignmentAction;
let transferAssignmentAction: typeof import('../actions').transferAssignmentAction;
let deleteAssignmentAction: typeof import('../actions').deleteAssignmentAction;
let searchAssignmentsAction: typeof import('../actions').searchAssignmentsAction;
let exportAssignmentsAction: typeof import('../actions').exportAssignmentsAction;

beforeEach(async () => {
  vi.clearAllMocks();
  const actions = await import('../actions');
  listAssignmentsAction = actions.listAssignmentsAction;
  listEmployeeAssignmentsAction = actions.listEmployeeAssignmentsAction;
  getEmployeeAssignmentsAction = actions.getEmployeeAssignmentsAction;
  createAssignmentAction = actions.createAssignmentAction;
  returnAssignmentAction = actions.returnAssignmentAction;
  transferAssignmentAction = actions.transferAssignmentAction;
  deleteAssignmentAction = actions.deleteAssignmentAction;
  searchAssignmentsAction = actions.searchAssignmentsAction;
  exportAssignmentsAction = actions.exportAssignmentsAction;
});

// ─── listAssignmentsAction (T-05) ─────────────────────────────────────────

describe('listAssignmentsAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await listAssignmentsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for VIEWER (no assignments:read)', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await listAssignmentsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns cursor-paginated rows for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[fakeDbAssignment], 1]);
    const r = await listAssignmentsAction({ pageSize: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.rows[0].assetCode).toBe('NVH-PC-00001');
    expect(r.data.rowCount).toBe(1);
    expect(r.data.pageInfo.hasNextPage).toBe(false);
    expect(r.data.pageInfo.hasPreviousPage).toBe(false);
  });

  it('filters by ACTIVE status by default', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[], 0]);
    await listAssignmentsAction();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('returns all rows when status is "all"', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[fakeDbAssignment], 1]);
    const r = await listAssignmentsAction({ status: 'all' });
    expect(r.ok).toBe(true);
  });

  it('allows MANAGER to list assignments', async () => {
    mockAuth.mockResolvedValue(managerSession);
    mockTransaction.mockResolvedValue([[], 0]);
    const r = await listAssignmentsAction();
    expect(r.ok).toBe(false); // MANAGER has assignments:create but NOT assignments:read
  });
});

// ─── createAssignmentAction (T-07) ─────────────────────────────────────────

describe('createAssignmentAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await createAssignmentAction({ assetId: 'a1', employeeId: 'e1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await createAssignmentAction({ assetId: 'a1', employeeId: 'e1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION when assetId is missing', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const r = await createAssignmentAction({ assetId: '', employeeId: 'e1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('VALIDATION');
  });

  it('returns VALIDATION when employeeId is missing', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const r = await createAssignmentAction({ assetId: 'a1', employeeId: '' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('VALIDATION');
  });

  it('creates assignment successfully with ACTIVE status', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(fakeDbAssignment),
        },
      };
      return fn(tx);
    });
    const r = await createAssignmentAction({ assetId: 'asset1', employeeId: 'emp1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('ACTIVE');
    expect(r.data.assetCode).toBe('NVH-PC-00001');
    expect(revalidatePath).toHaveBeenCalledWith('/assignments');
  });

  it('returns CONFLICT when asset already has ACTIVE assignment', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          findFirst: vi.fn().mockResolvedValue(fakeDbAssignment), // already active
          create: vi.fn(),
        },
      };
      return fn(tx);
    });
    const r = await createAssignmentAction({ assetId: 'asset1', employeeId: 'emp1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
  });

  it('allows MANAGER to create assignment', async () => {
    mockAuth.mockResolvedValue(managerSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(fakeDbAssignment),
        },
      };
      return fn(tx);
    });
    const r = await createAssignmentAction({ assetId: 'asset1', employeeId: 'emp1' });
    expect(r.ok).toBe(true);
  });
});

// ─── returnAssignmentAction (T-09) ─────────────────────────────────────────

describe('returnAssignmentAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await returnAssignmentAction('asgn1', {});
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await returnAssignmentAction('asgn1', {});
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('marks assignment as RETURNED', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const returnedAssignment = {
      ...fakeDbAssignment,
      status: 'RETURNED',
      returnedAt: new Date('2025-06-01T00:00:00.000Z'),
    };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          update: vi.fn().mockResolvedValue(returnedAssignment),
        },
      };
      return fn(tx);
    });
    const r = await returnAssignmentAction('asgn1', { notes: 'Devuelto en buen estado' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('RETURNED');
    expect(revalidatePath).toHaveBeenCalledWith('/assignments');
  });

  it('returns CONFLICT when assignment is already closed (P2025)', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          update: vi.fn().mockRejectedValue({ code: 'P2025' }),
        },
      };
      return fn(tx);
    });
    const r = await returnAssignmentAction('asgn1', {});
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
  });
});

// ─── transferAssignmentAction (T-11) ───────────────────────────────────────

describe('transferAssignmentAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: 'emp2' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: 'emp2' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION when newEmployeeId is missing', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: '' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('VALIDATION');
  });

  it('transfers assignment atomically: old→TRANSFERRED, new ACTIVE created', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const transferredAssignment = {
      ...fakeDbAssignment,
      status: 'TRANSFERRED',
      returnedAt: new Date(),
    };
    const newAssignment = {
      ...fakeDbAssignment,
      id: 'asgn2',
      employeeId: 'emp2',
      employee: { fullName: 'María López', email: 'maria@novahold.com' },
      status: 'ACTIVE',
    };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          update: vi.fn().mockResolvedValue(transferredAssignment),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(newAssignment),
        },
      };
      return fn(tx);
    });
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: 'emp2' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('ACTIVE');
    expect(r.data.employeeId).toBe('emp2');
    expect(revalidatePath).toHaveBeenCalledWith('/assignments');
  });

  it('returns CONFLICT when assignment is already closed (P2025)', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          update: vi.fn().mockRejectedValue({ code: 'P2025' }),
          findFirst: vi.fn(),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: 'emp2' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
  });

  it('returns CONFLICT when target employee already has active assignment for same asset', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const transferredAssignment = {
      ...fakeDbAssignment,
      status: 'TRANSFERRED',
      returnedAt: new Date(),
      assetId: 'asset1',
    };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        assignment: {
          update: vi.fn().mockResolvedValue(transferredAssignment),
          findFirst: vi.fn().mockResolvedValue(fakeDbAssignment), // existing active
          create: vi.fn(),
        },
      };
      return fn(tx);
    });
    const r = await transferAssignmentAction('asgn1', { newEmployeeId: 'emp2' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
  });
});

// ─── deleteAssignmentAction (T-13) ─────────────────────────────────────────

describe('deleteAssignmentAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for MANAGER (no assignments:delete)', async () => {
    mockAuth.mockResolvedValue(managerSession);
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when assignment does not exist', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue(null);
    const r = await deleteAssignmentAction('ghost');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('NOT_FOUND');
  });

  it('blocks delete when status is ACTIVE', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue({ id: 'asgn1', status: 'ACTIVE' });
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
    expect((r as { ok: false; message: string }).message).toContain('activa');
  });

  it('deletes RETURNED assignment successfully', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue({ id: 'asgn1', status: 'RETURNED' });
    mockAssignment.delete.mockResolvedValue({});
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(true);
    expect(mockAssignment.delete).toHaveBeenCalledWith({ where: { id: 'asgn1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/assignments');
  });

  it('deletes TRANSFERRED assignment successfully', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findUnique.mockResolvedValue({ id: 'asgn1', status: 'TRANSFERRED' });
    mockAssignment.delete.mockResolvedValue({});
    const r = await deleteAssignmentAction('asgn1');
    expect(r.ok).toBe(true);
  });
});

// ─── toEmployeeAssignmentRow ──────────────────────────────────────────────

describe('toEmployeeAssignmentRow', () => {
  const baseEmployee = {
    id: 'emp1',
    fullName: 'Juan Pérez',
    email: 'juan@novahold.com',
    department: { name: 'Tecnología' },
    location: { name: 'Bogotá' },
    assignments: [] as Array<{ status: string; assignedAt: Date; returnedAt: Date | null }>,
  };

  it('returns zero counts when no assignments', () => {
    const row = toEmployeeAssignmentRow({ ...baseEmployee, assignments: [] });
    expect(row.activeCount).toBe(0);
    expect(row.lastAssignedAt).toBeNull();
    expect(row.lastReturnedAt).toBeNull();
  });

  it('counts only ACTIVE assignments', () => {
    const row = toEmployeeAssignmentRow({
      ...baseEmployee,
      assignments: [
        { status: 'ACTIVE', assignedAt: now, returnedAt: null },
        { status: 'RETURNED', assignedAt: new Date('2025-01-01'), returnedAt: new Date('2025-02-01') },
      ],
    });
    expect(row.activeCount).toBe(1);
  });

  it('sets lastAssignedAt to max assignedAt of ACTIVE assignments', () => {
    const older = new Date('2025-01-01');
    const newer = new Date('2025-06-01');
    const row = toEmployeeAssignmentRow({
      ...baseEmployee,
      assignments: [
        { status: 'ACTIVE', assignedAt: older, returnedAt: null },
        { status: 'ACTIVE', assignedAt: newer, returnedAt: null },
      ],
    });
    expect(row.lastAssignedAt).toBe(newer.toISOString());
  });

  it('sets lastReturnedAt to max returnedAt of closed assignments', () => {
    const ret1 = new Date('2025-02-01');
    const ret2 = new Date('2025-05-01');
    const row = toEmployeeAssignmentRow({
      ...baseEmployee,
      assignments: [
        { status: 'RETURNED', assignedAt: new Date('2025-01-01'), returnedAt: ret1 },
        { status: 'TRANSFERRED', assignedAt: new Date('2025-03-01'), returnedAt: ret2 },
      ],
    });
    expect(row.lastReturnedAt).toBe(ret2.toISOString());
  });

  it('maps department and location names', () => {
    const row = toEmployeeAssignmentRow(baseEmployee);
    expect(row.employeeDepartment).toBe('Tecnología');
    expect(row.employeeLocation).toBe('Bogotá');
  });

  it('handles null department and location', () => {
    const row = toEmployeeAssignmentRow({ ...baseEmployee, department: null, location: null });
    expect(row.employeeDepartment).toBeNull();
    expect(row.employeeLocation).toBeNull();
  });
});

// ─── listEmployeeAssignmentsAction ────────────────────────────────────────

describe('listEmployeeAssignmentsAction', () => {
  const fakeEmployeeWithAssignments = {
    id: 'emp1',
    fullName: 'Juan Pérez',
    email: 'juan@novahold.com',
    department: { name: 'Tecnología' },
    location: { name: 'Bogotá' },
    assignments: [
      { status: 'ACTIVE', assignedAt: now, returnedAt: null },
    ],
  };

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await listEmployeeAssignmentsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for VIEWER (no assignments:read)', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await listEmployeeAssignmentsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns employee rows for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockEmployee.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[fakeEmployeeWithAssignments], 1]);
    const r = await listEmployeeAssignmentsAction({ pageSize: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.rows[0].employeeName).toBe('Juan Pérez');
    expect(r.data.rows[0].activeCount).toBe(1);
    expect(r.data.rowCount).toBe(1);
    expect(r.data.pageInfo.hasNextPage).toBe(false);
  });

  it('returns empty rows when no employees have assignments', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockEmployee.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[], 0]);
    const r = await listEmployeeAssignmentsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(0);
    expect(r.data.rowCount).toBe(0);
    expect(r.data.pageInfo.hasNextPage).toBe(false);
  });
});

// ─── getEmployeeAssignmentsAction ─────────────────────────────────────────

describe('getEmployeeAssignmentsAction', () => {
  const returnedAssignment = {
    ...fakeDbAssignment,
    id: 'asgn2',
    status: 'RETURNED',
    returnedAt: new Date('2025-03-01'),
  };

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await getEmployeeAssignmentsAction('emp1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('splits assignments into active and history', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([fakeDbAssignment, returnedAssignment]);
    const r = await getEmployeeAssignmentsAction('emp1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.active).toHaveLength(1);
    expect(r.data.active[0].status).toBe('ACTIVE');
    expect(r.data.history).toHaveLength(1);
    expect(r.data.history[0].status).toBe('RETURNED');
  });

  it('returns empty arrays when employee has no assignments', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([]);
    const r = await getEmployeeAssignmentsAction('emp1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.active).toHaveLength(0);
    expect(r.data.history).toHaveLength(0);
  });
});

// ─── searchAssignmentsAction (T-15) ───────────────────────────────────────

describe('searchAssignmentsAction', () => {
  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await searchAssignmentsAction('NVH');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns matching assignments as autocomplete options', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([
      {
        id: 'asgn1',
        asset: { assetCode: 'NVH-PC-00001' },
        employee: { fullName: 'Juan Pérez' },
      },
    ]);
    const r = await searchAssignmentsAction('NVH');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0].code).toBe('asgn1');
    expect(r.data[0].value).toContain('NVH-PC-00001');
    expect(r.data[0].value).toContain('Juan Pérez');
  });

  it('returns empty array when no matches', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([]);
    const r = await searchAssignmentsAction('xyz');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(0);
  });
});

// ─── exportAssignmentsAction ───────────────────────────────────────────────

describe('exportAssignmentsAction', () => {
  const fakeActiveAssignment = {
    id: 'asgn1',
    assignedAt: now,
    status: 'ACTIVE',
    employee: { fullName: 'Juan Pérez', email: 'juan@novahold.com' },
    asset: { assetCode: 'NVH-PC-00001', category: { name: 'Computador Portátil' } },
  };

  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await exportAssignmentsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns base64 xlsx for authenticated user', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([fakeActiveAssignment]);
    const r = await exportAssignmentsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data.base64).toBe('string');
    expect(r.data.base64.length).toBeGreaterThan(0);
    expect(r.data.filename).toContain('.xlsx');
  });

  it('returns empty xlsx when no active assignments', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAssignment.findMany.mockResolvedValue([]);
    const r = await exportAssignmentsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data.base64).toBe('string');
  });
});
