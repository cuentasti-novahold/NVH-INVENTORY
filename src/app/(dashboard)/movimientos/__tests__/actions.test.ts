// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    assetMovement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/location', () => ({ locationHasBodegas: vi.fn() }));
vi.mock('@/lib/inventory/movement.helpers', () => ({
  createMovementInTx: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
  AuditActions: { MOVED: 'MOVED' },
  getRequestMeta: vi.fn().mockResolvedValue({ ip: null, userAgent: null }),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { locationHasBodegas } from '@/lib/location';
import { getRequestMeta } from '@/lib/audit';

import { toMovementRow } from '../presentation/mappers/movement.mapper';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockMovement = prisma.assetMovement as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockLocationHasBodegas = locationHasBodegas as ReturnType<typeof vi.fn>;
const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;

const adminSession = { user: { id: 'u1', role: 'ADMIN' } };
const managerSession = { user: { id: 'u2', role: 'MANAGER' } };
const viewerSession = { user: { id: 'u3', role: 'VIEWER' } };
const technicianSession = { user: { id: 'u4', role: 'TECHNICIAN' } };

const now = new Date('2025-03-15T10:00:00.000Z');

const fakeDbMovement = {
  id: 'mov1',
  assetId: 'ast1',
  fromLocationId: 'loc-bogota',
  fromBodegaId: 'bod-bogota',
  toLocationId: 'loc-medellin',
  toBodegaId: 'bod-medellin',
  movementType: 'RELOCATION' as const,
  reason: 'Traslado de sede',
  notes: null,
  movedById: 'u1',
  movedAt: now,
  createdAt: now,
  updatedAt: now,
  asset: { assetCode: 'NVH-PC-00001', brand: 'Lenovo', model: 'ThinkPad X1' },
  fromLocation: { name: 'Sede Principal Bogotá' },
  toLocation: { name: 'Sede Medellín' },
  fromBodega: { name: 'Bodega Bogotá' },
  toBodega: { name: 'Bodega Medellín' },
  movedBy: { name: 'Admin User' },
};

// ─── toMovementRow ────────────────────────────────────────────────────────────

describe('toMovementRow', () => {
  it('maps all fields correctly', () => {
    const row = toMovementRow(fakeDbMovement);
    expect(row.id).toBe('mov1');
    expect(row.assetId).toBe('ast1');
    expect(row.assetCode).toBe('NVH-PC-00001');
    expect(row.assetLabel).toBe('Lenovo ThinkPad X1');
    expect(row.fromLocationId).toBe('loc-bogota');
    expect(row.fromLocationName).toBe('Sede Principal Bogotá');
    expect(row.fromBodegaId).toBe('bod-bogota');
    expect(row.fromBodegaName).toBe('Bodega Bogotá');
    expect(row.toLocationId).toBe('loc-medellin');
    expect(row.toLocationName).toBe('Sede Medellín');
    expect(row.toBodegaId).toBe('bod-medellin');
    expect(row.toBodegaName).toBe('Bodega Medellín');
    expect(row.movementType).toBe('RELOCATION');
    expect(row.reason).toBe('Traslado de sede');
    expect(row.notes).toBeNull();
    expect(row.movedById).toBe('u1');
    expect(row.movedByName).toBe('Admin User');
    expect(row.movedAt).toBe(now.toISOString());
    expect(row.createdAt).toBe(now.toISOString());
  });

  it('handles null fromLocation and fromBodega (first-time asset entry)', () => {
    const row = toMovementRow({
      ...fakeDbMovement,
      fromLocationId: null,
      fromBodegaId: null,
      fromLocation: null,
      fromBodega: null,
    });
    expect(row.fromLocationId).toBeNull();
    expect(row.fromLocationName).toBeNull();
    expect(row.fromBodegaId).toBeNull();
    expect(row.fromBodegaName).toBeNull();
  });

  it('falls back to assetCode when brand and model are null', () => {
    const row = toMovementRow({
      ...fakeDbMovement,
      asset: { assetCode: 'NVH-PC-00001', brand: null, model: null },
    });
    expect(row.assetLabel).toBe('NVH-PC-00001');
  });

  it('handles null toBodega', () => {
    const row = toMovementRow({
      ...fakeDbMovement,
      toBodegaId: null,
      toBodega: null,
    });
    expect(row.toBodegaId).toBeNull();
    expect(row.toBodegaName).toBeNull();
  });
});

// ─── listMovementsAction ──────────────────────────────────────────────────────

describe('listMovementsAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMovement.findMany.mockResolvedValue([fakeDbMovement]);
    mockMovement.count.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all((ops as Promise<unknown>[]).map((p) => p)),
    );
  });

  it('returns FORBIDDEN when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { listMovementsAction } = await import('../actions');
    const result = await listMovementsAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns cursor-paginated rows for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.findUnique.mockResolvedValue(null);
    const { listMovementsAction } = await import('../actions');
    const result = await listMovementsAction({ pageSize: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].assetCode).toBe('NVH-PC-00001');
      expect(result.data.rowCount).toBe(1);
      expect(result.data.pageInfo.hasNextPage).toBe(false);
      expect(result.data.pageInfo.hasPreviousPage).toBe(false);
    }
  });

  it('filters by movementType when not "all"', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.findUnique.mockResolvedValue(null);
    mockMovement.findMany.mockResolvedValue([]);
    mockMovement.count.mockResolvedValue(0);
    const { listMovementsAction } = await import('../actions');
    await listMovementsAction({ movementType: 'REPAIR' });
    expect(mockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ movementType: 'REPAIR' }),
      }),
    );
  });

  it('filters by assetId for Kardex mode', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.findUnique.mockResolvedValue(null);
    mockMovement.findMany.mockResolvedValue([fakeDbMovement]);
    mockMovement.count.mockResolvedValue(1);
    const { listMovementsAction } = await import('../actions');
    await listMovementsAction({ assetId: 'ast1' });
    expect(mockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetId: 'ast1' }),
      }),
    );
  });

  it('returns hasNextPage=false when rowCount is 0', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.findUnique.mockResolvedValue(null);
    mockMovement.findMany.mockResolvedValue([]);
    mockMovement.count.mockResolvedValue(0);
    const { listMovementsAction } = await import('../actions');
    const result = await listMovementsAction({});
    if (result.ok) expect(result.data.pageInfo.hasNextPage).toBe(false);
  });
});

// ─── createMovementAction ────────────────────────────────────────────────────

describe('createMovementAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore getRequestMeta after vi.resetAllMocks() clears its return value
    mockGetRequestMeta.mockResolvedValue({ ip: null, userAgent: null });
  });

  it('returns UNAUTHORIZED when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION when assetId is empty', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: '',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.assetId).toBeDefined();
    }
  });

  it('returns VALIDATION when toLocationId is empty', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: '',
      movementType: 'RELOCATION',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.toLocationId).toBeDefined();
    }
  });

  it('returns VALIDATION when movementType is invalid', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'INVALID_TYPE' as 'RELOCATION',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });

  it('creates movement successfully — createMovementInTx called + writeAudit called', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(false);

    const { createMovementInTx } = await import('@/lib/inventory/movement.helpers');
    const mockHelper = createMovementInTx as ReturnType<typeof vi.fn>;
    mockHelper.mockResolvedValue({ ...fakeDbMovement });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
      reason: 'Traslado de sede',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.assetCode).toBe('NVH-PC-00001');
    expect(mockHelper).toHaveBeenCalledTimes(1);
    expect(mockHelper).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assetId: 'ast1', toLocationId: 'loc-medellin' }),
    );
  });

  it('revalidates both /movimientos and /assets after success', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(false);

    const { createMovementInTx } = await import('@/lib/inventory/movement.helpers');
    const mockHelper = createMovementInTx as ReturnType<typeof vi.fn>;
    mockHelper.mockResolvedValue(fakeDbMovement);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });

    expect(revalidatePath).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePath).toHaveBeenCalledWith('/assets');
  });

  it('returns UNKNOWN on unexpected DB error', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockTransaction.mockRejectedValue(new Error('DB error'));

    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN');
  });
});

// ─── deleteMovementAction ─────────────────────────────────────────────────────

describe('deleteMovementAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns UNAUTHORIZED when session is null', async () => {
    mockAuth.mockResolvedValue(null);
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('mov1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('mov1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for MANAGER (has create but not delete)', async () => {
    mockAuth.mockResolvedValue(managerSession);
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('mov1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for TECHNICIAN', async () => {
    mockAuth.mockResolvedValue(technicianSession);
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('mov1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when movement does not exist (P2025)', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.delete.mockRejectedValue({ code: 'P2025' });
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('deletes movement successfully for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockMovement.delete.mockResolvedValue({});
    const { deleteMovementAction } = await import('../actions');
    const result = await deleteMovementAction('mov1');
    expect(result.ok).toBe(true);
    expect(mockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/movimientos');
  });
});

// ─── T-03-B/C: createMovementAction toBodegaId guard ─────────────────────────

describe('createMovementAction — conditional toBodegaId guard (T-03-B / T-03-C)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRequestMeta.mockResolvedValue({ ip: null, userAgent: null });
  });

  it('T-03-B: returns VALIDATION with fieldErrors.toBodegaId when toLocation has bodegas and toBodegaId absent', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(true);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        assetMovement: { create: vi.fn().mockResolvedValue(fakeDbMovement) },
        asset: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-with-bodegas',
      movementType: 'RELOCATION',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors?.toBodegaId).toBeDefined();
  });

  it('T-03-C: succeeds when toLocation has zero bodegas and toBodegaId absent', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(false);

    const { createMovementInTx } = await import('@/lib/inventory/movement.helpers');
    const mockHelper = createMovementInTx as ReturnType<typeof vi.fn>;
    mockHelper.mockResolvedValue(fakeDbMovement);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-no-bodegas',
      movementType: 'RELOCATION',
    });

    expect(result.ok).toBe(true);
  });
});

// ─── T-3.1 Regression: createMovementAction uses createMovementInTx helper ─────

describe('createMovementAction — refactored to use createMovementInTx (T-3.1)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRequestMeta.mockResolvedValue({ ip: null, userAgent: null });
  });

  it('delegates movement creation and asset update to createMovementInTx', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(false);

    const { createMovementInTx } = await import('@/lib/inventory/movement.helpers');
    const mockHelper = createMovementInTx as ReturnType<typeof vi.fn>;
    // After refactor, helper returns the movement with include
    mockHelper.mockResolvedValue(fakeDbMovement);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        assetMovement: { create: vi.fn() },
        asset: { update: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    const result = await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
      reason: 'Traslado de sede',
    });

    expect(result.ok).toBe(true);
    // createMovementInTx must have been called (proves refactor)
    expect(mockHelper).toHaveBeenCalledTimes(1);
    expect(mockHelper).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assetId: 'ast1',
        toLocationId: 'loc-medellin',
        movementType: 'RELOCATION',
      }),
    );
  });

  it('still calls writeAudit after createMovementInTx', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockLocationHasBodegas.mockResolvedValue(false);

    const { createMovementInTx } = await import('@/lib/inventory/movement.helpers');
    const mockHelper = createMovementInTx as ReturnType<typeof vi.fn>;
    mockHelper.mockResolvedValue(fakeDbMovement);

    const { writeAudit } = await import('@/lib/audit');
    const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        assetMovement: { create: vi.fn() },
        asset: { update: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { createMovementAction } = await import('../actions');
    await createMovementAction({
      assetId: 'ast1',
      toLocationId: 'loc-medellin',
      movementType: 'RELOCATION',
    });

    expect(mockWriteAudit).toHaveBeenCalledTimes(1);
  });
});
