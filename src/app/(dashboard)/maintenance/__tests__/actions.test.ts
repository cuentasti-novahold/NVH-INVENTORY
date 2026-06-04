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

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

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

  it('returns FORBIDDEN for VIEWER (no maintenance:read permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { listMaintenancesAction } = await import('../actions');
    const result = await listMaintenancesAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
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
    mockMaintenance.delete.mockRejectedValue({ code: 'P2025' });
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('deletes maintenance successfully for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMaintenance.delete.mockResolvedValue({});
    const { deleteMaintenanceAction } = await import('../actions');
    const result = await deleteMaintenanceAction('mnt1');
    expect(result.ok).toBe(true);
    expect(mockMaintenance.delete).toHaveBeenCalledWith({ where: { id: 'mnt1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/maintenance');
  });
});
