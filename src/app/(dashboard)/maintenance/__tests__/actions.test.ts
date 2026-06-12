// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    maintenance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn(),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DEACTIVATE: 'DEACTIVATE',
    DELETE: 'DELETE',
    RETURNED: 'RETURNED',
    TRANSFERRED: 'TRANSFERRED',
  },
  getRequestMeta: vi.fn().mockResolvedValue({ ip: null, userAgent: null }),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getRequestMeta } from '@/lib/audit';

import { toMaintenanceRow } from '../presentation/mappers/maintenance.mapper';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockMaintenance = prisma.maintenance as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const adminSession = { user: { id: 'u1', role: 'ADMIN' } };
const viewerSession = { user: { id: 'u2', role: 'VIEWER' } };
const technicianSession = { user: { id: 'u3', role: 'TECHNICIAN' } };

const now = new Date('2025-03-15T10:00:00.000Z');

const fakeDbMaintenance = {
  id: 'mnt1',
  assetId: 'ast1',
  type: 'REVISION' as const,
  description: 'Revisión semestral',
  performedBy: 'Técnico Torres',
  performedAt: now,
  nextReview: new Date('2025-09-15T10:00:00.000Z'),
  createdAt: now,
  updatedAt: now,
  asset: { assetCode: 'NVH-PC-00001', brand: 'Dell', model: 'Latitude 5420' },
};

// ─── toMaintenanceRow ─────────────────────────────────────────────────────────

describe('toMaintenanceRow', () => {
  it('maps all fields correctly', () => {
    const row = toMaintenanceRow(fakeDbMaintenance);
    expect(row.id).toBe('mnt1');
    expect(row.assetId).toBe('ast1');
    expect(row.assetCode).toBe('NVH-PC-00001');
    expect(row.assetLabel).toBe('Dell Latitude 5420');
    expect(row.type).toBe('REVISION');
    expect(row.description).toBe('Revisión semestral');
    expect(row.performedBy).toBe('Técnico Torres');
    expect(row.performedAt).toBe(now.toISOString());
    expect(row.nextReview).toBe(new Date('2025-09-15T10:00:00.000Z').toISOString());
    expect(row.createdAt).toBe(now.toISOString());
  });

  it('falls back to assetCode when brand and model are null', () => {
    const row = toMaintenanceRow({
      ...fakeDbMaintenance,
      asset: { assetCode: 'NVH-PC-00001', brand: null, model: null },
    });
    expect(row.assetLabel).toBe('NVH-PC-00001');
  });

  it('maps null nextReview to null', () => {
    const row = toMaintenanceRow({ ...fakeDbMaintenance, nextReview: null });
    expect(row.nextReview).toBeNull();
  });

  it('maps null description and performedBy', () => {
    const row = toMaintenanceRow({
      ...fakeDbMaintenance,
      description: null,
      performedBy: null,
    });
    expect(row.description).toBeNull();
    expect(row.performedBy).toBeNull();
  });
});

// ─── listMaintenancesAction ───────────────────────────────────────────────────

describe('listMaintenancesAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMaintenance.findMany.mockResolvedValue([fakeDbMaintenance]);
    mockMaintenance.count.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all((ops as Promise<unknown>[]).map((p) => p)),
    );
  });

  it('returns FORBIDDEN when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { listMaintenancesAction } = await import('../actions');
    const result = await listMaintenancesAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('allows VIEWER to list maintenances (has maintenance:read permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { listMaintenancesAction } = await import('../actions');
    const result = await listMaintenancesAction({});
    // VIEWER has maintenance:read — should not be FORBIDDEN
    expect(result.ok).toBe(true);
  });

  it('returns cursor-paginated rows for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.findUnique.mockResolvedValue(null);
    const { listMaintenancesAction } = await import('../actions');
    const result = await listMaintenancesAction({ pageSize: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].assetCode).toBe('NVH-PC-00001');
      expect(result.data.rowCount).toBe(1);
      expect(result.data.pageInfo.hasNextPage).toBe(false);
      expect(result.data.pageInfo.hasPreviousPage).toBe(false);
    }
  });

  it('filters by type when not "all"', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.findUnique.mockResolvedValue(null);
    mockMaintenance.findMany.mockResolvedValue([]);
    mockMaintenance.count.mockResolvedValue(0);
    const { listMaintenancesAction } = await import('../actions');
    await listMaintenancesAction({ type: 'REPAIR' });
    expect(mockMaintenance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'REPAIR' }),
      }),
    );
  });

  it('filters by assetId', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.findUnique.mockResolvedValue(null);
    mockMaintenance.findMany.mockResolvedValue([fakeDbMaintenance]);
    mockMaintenance.count.mockResolvedValue(1);
    const { listMaintenancesAction } = await import('../actions');
    await listMaintenancesAction({ assetId: 'ast1' });
    expect(mockMaintenance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetId: 'ast1' }),
      }),
    );
  });

  it('returns hasNextPage=false when rowCount is 0', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.findUnique.mockResolvedValue(null);
    mockMaintenance.findMany.mockResolvedValue([]);
    mockMaintenance.count.mockResolvedValue(0);
    const { listMaintenancesAction } = await import('../actions');
    const result = await listMaintenancesAction({});
    if (result.ok) expect(result.data.pageInfo.hasNextPage).toBe(false);
  });
});

// ─── createMaintenanceAction ──────────────────────────────────────────────────

describe('createMaintenanceAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getRequestMeta as ReturnType<typeof vi.fn>).mockResolvedValue({ ip: null, userAgent: null });
  });

  it('returns UNAUTHORIZED when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION when assetId is empty', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: '',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.assetId).toBeDefined();
    }
  });

  it('returns VALIDATION when type is invalid', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'INVALID' as 'REVISION',
      performedAt: '2025-03-15',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });

  it('creates REVISION maintenance and updates lastRevision', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    const createdMaintenance = { ...fakeDbMaintenance };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { create: vi.fn().mockResolvedValue(createdMaintenance) },
        asset: { update: vi.fn().mockResolvedValue({}) },
      };
      const result = await fn(tx);
      expect(tx.maintenance.create).toHaveBeenCalledTimes(1);
      expect(tx.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ast1' },
          data: expect.objectContaining({ lastRevision: expect.any(Date) }),
        }),
      );
      return result;
    });

    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.assetCode).toBe('NVH-PC-00001');
  });

  it('creates non-REVISION maintenance without updating lastRevision', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    const createdMaintenance = { ...fakeDbMaintenance, type: 'REPAIR' as const };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { create: vi.fn().mockResolvedValue(createdMaintenance) },
        asset: { update: vi.fn().mockResolvedValue({}) },
      };
      const result = await fn(tx);
      expect(tx.asset.update).not.toHaveBeenCalled();
      return result;
    });

    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REPAIR',
      performedAt: '2025-03-15',
    });

    expect(result.ok).toBe(true);
  });

  it('revalidates /maintenance after success', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { create: vi.fn().mockResolvedValue(fakeDbMaintenance) },
        asset: { update: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMaintenanceAction } = await import('../actions');
    await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });

    expect(revalidatePath).toHaveBeenCalledWith('/maintenance');
  });

  it('returns UNKNOWN on unexpected DB error', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    mockTransaction.mockRejectedValue(new Error('DB error'));

    const { createMaintenanceAction } = await import('../actions');
    const result = await createMaintenanceAction({
      assetId: 'ast1',
      type: 'REVISION',
      performedAt: '2025-03-15',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN');
  });
});

// ─── deleteMaintenanceAction ──────────────────────────────────────────────────

describe('deleteMaintenanceAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getRequestMeta as ReturnType<typeof vi.fn>).mockResolvedValue({ ip: null, userAgent: null });
  });

  it('returns UNAUTHORIZED when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('mnt1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('mnt1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when record does not exist (P2025)', async () => {
    mockAuth.mockResolvedValue(adminSession);
    // pre-fetch returns a record (or null for not found — tested via tx.maintenance.delete error)
    mockMaintenance.findUnique.mockResolvedValue({ assetId: 'ast1', type: 'REVISION', performedAt: now });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { delete: vi.fn().mockRejectedValue({ code: 'P2025' }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('deletes maintenance successfully for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.findUnique.mockResolvedValue({ assetId: 'ast1', type: 'REVISION', performedAt: now });
    const txMaintenanceDelete = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { delete: txMaintenanceDelete },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('mnt1');
    expect(result.ok).toBe(true);
    expect(txMaintenanceDelete).toHaveBeenCalledWith({ where: { id: 'mnt1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/maintenance');
  });
});

// ─── Audit: createMaintenanceAction ───────────────────────────────────────────

describe('audit — createMaintenanceAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getRequestMeta as ReturnType<typeof vi.fn>).mockResolvedValue({ ip: null, userAgent: null });
  });

  it('calls writeAudit with action=CREATE, before=null, after has assetId+type+performedAt', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    const { writeAudit } = await import('@/lib/audit');
    const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
    mockWriteAudit.mockClear();

    const createdMaintenance = { ...fakeDbMaintenance };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: { create: vi.fn().mockResolvedValue(createdMaintenance) },
        asset: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMaintenanceAction } = await import('../actions');
    await createMaintenanceAction({ assetId: 'ast1', type: 'REVISION', performedAt: '2025-03-15' });

    expect(mockWriteAudit).toHaveBeenCalled();
    const callArgs = mockWriteAudit.mock.calls[0][1];
    expect(callArgs.action).toBe('CREATE');
    expect(callArgs.entity).toBe('Maintenance');
    expect(callArgs.before).toBeNull();
    expect(callArgs.after).toMatchObject({ assetId: 'ast1', type: 'REVISION' });
    expect(callArgs.after.performedAt).toBeDefined();
  });
});

// ─── Audit: updateMaintenanceAction ───────────────────────────────────────────

describe('audit — updateMaintenanceAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getRequestMeta as ReturnType<typeof vi.fn>).mockResolvedValue({ ip: null, userAgent: null });
  });

  it('calls writeAudit with action=UPDATE, before and after differ', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { writeAudit } = await import('@/lib/audit');
    const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
    mockWriteAudit.mockClear();

    // The action pre-fetches snapshot via bare prisma.maintenance.findUnique BEFORE the tx
    const snapshot = { type: 'REVISION', description: 'Old description', performedBy: 'Old Technician', performedAt: now, nextReview: null };
    mockMaintenance.findUnique.mockResolvedValue(snapshot);

    const updatedMaintenance = { ...fakeDbMaintenance, description: 'New description' };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: {
          update: vi.fn().mockResolvedValue(updatedMaintenance),
        },
        asset: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { updateMaintenanceAction } = await import('../actions');
    await updateMaintenanceAction('mnt1', { description: 'New description' });

    expect(mockWriteAudit).toHaveBeenCalled();
    const callArgs = mockWriteAudit.mock.calls[0][1];
    expect(callArgs.action).toBe('UPDATE');
    expect(callArgs.entity).toBe('Maintenance');
    expect(callArgs.before).toMatchObject({ type: 'REVISION', description: 'Old description' });
    expect(callArgs.after).toMatchObject({ description: 'New description' });
  });
});

// ─── Audit: deleteMaintenanceAction (S-12) ────────────────────────────────────

describe('audit — deleteMaintenanceAction (S-12)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getRequestMeta as ReturnType<typeof vi.fn>).mockResolvedValue({ ip: null, userAgent: null });
  });

  it('writeAudit called BEFORE maintenance.delete; action=DELETE; before.assetId=asset-1; after=null', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { writeAudit } = await import('@/lib/audit');
    const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
    mockWriteAudit.mockClear();

    const callOrder: string[] = [];

    const maintenanceDelete = vi.fn().mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve({});
    });

    // writeAudit is mocked at module level; track when it's called relative to delete
    mockWriteAudit.mockImplementation(async () => {
      callOrder.push('audit');
    });

    // The action pre-fetches snapshot via bare prisma.maintenance.findUnique BEFORE the $transaction
    mockMaintenance.findUnique.mockResolvedValue({
      assetId: 'asset-1',
      type: 'PREVENTIVE',
      performedAt: now,
    });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        maintenance: {
          delete: maintenanceDelete,
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('maint-1');
    expect(result.ok).toBe(true);

    expect(mockWriteAudit).toHaveBeenCalled();
    const callArgs = mockWriteAudit.mock.calls[0][1];
    expect(callArgs.action).toBe('DELETE');
    expect(callArgs.entity).toBe('Maintenance');
    expect(callArgs.entityId).toBe('maint-1');
    expect(callArgs.before).toMatchObject({ assetId: 'asset-1' });
    expect(callArgs.after).toBeNull();

    // writeAudit (audit) must be called before delete
    expect(callOrder.indexOf('audit')).toBeLessThan(callOrder.indexOf('delete'));
  });
});
