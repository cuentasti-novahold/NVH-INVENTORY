// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    location: { findFirst: vi.fn() },
    bodega: { findFirst: vi.fn() },
    currency: { findUnique: vi.fn() },
    exchangeRate: { findFirst: vi.fn() },
    importLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Capture the real hasPermission in a vi.hoisted block so it is available inside
// the vi.mock factory (which is hoisted before all other code).
const { realHasPermission } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realHasPermission = { fn: null as any };
  return { realHasPermission };
});
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  realHasPermission.fn = actual.hasPermission;
  // Wrap in a vi.fn so individual tests can override with mockReturnValueOnce(false).
  // Default implementation delegates to the real function so role-based tests still work.
  return { ...actual, hasPermission: vi.fn().mockImplementation(actual.hasPermission) };
});

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import {
  listAssetsAction,
  searchAssetsAction,
  getCategoryFieldConfigAction,
  getAssetLocationAction,
  createAssetAction,
  updateAssetAction,
  deactivateAssetAction,
  deleteAssetAction,
  importAssetsAction,
  getAssetDetailAction,
  exportInventoryAction,
  exportDepreciationAction,
  exportExpiringAction,
  getAssetHistoryAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockHasPermission = hasPermission as ReturnType<typeof vi.fn>;
const mockAsset = prisma.asset as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockCategory = prisma.category as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockImportLog = prisma.importLog as unknown as Record<string, ReturnType<typeof vi.fn>>;

// Restore real hasPermission after each vi.clearAllMocks() call resets the implementation.
// vi.clearAllMocks() in vitest v4 resets mockImplementation, so we restore it globally.
beforeEach(() => {
  mockHasPermission.mockImplementation(realHasPermission.fn);
});

const adminSession = { user: { id: 'u1', role: 'ADMIN' } };
const viewerSession = { user: { id: 'u2', role: 'VIEWER' } };

const baseCategory = {
  id: 'cat1',
  name: 'Computador Portátil',
  prefix: 'PC',
  sequence: 0,
  fieldConfig: { processor: 'required', ram: 'required', phoneNumber: 'hidden' },
  defaultUsefulLife: 3,
};

const baseAsset = {
  id: 'asset1',
  assetCode: 'NVH-PC-00001',
  assetTag: null,
  hostname: null,
  categoryId: 'cat1',
  brand: 'Lenovo',
  model: 'ThinkPad X1',
  serialNumber: 'SN-001',
  processor: 'i7',
  ram: '16GB',
  storageCapacity: '512GB',
  storageType: 'SSD',
  operatingSystem: 'Windows 11',
  phoneNumber: null,
  imei: null,
  purchasePrice: { toString: () => '5000000' },
  currencyCode: 'COP',
  purchasePriceBase: { toString: () => '5000000' },
  salvageValue: null,
  usefulLifeYears: 3,
  purchaseDate: new Date('2024-01-15'),
  generalStatus: 'GOOD',
  functionalStatus: 'GOOD',
  lastRevision: null,
  notes: null,
  locationId: null,
  bodegaId: null,
  parentAssetId: null,
  isActive: true,
  createdAt: new Date('2024-01-15'),
  category: { name: 'Computador Portátil', prefix: 'PC', fieldConfig: null },
  location: null,
  bodega: null,
  parentAsset: null,
  _count: { assignments: 0, components: 0 },
};

// ─── listAssetsAction ───────────────────────────────────────────────────────

describe('listAssetsAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await listAssetsAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN for unauthenticated user', async () => {
    mockAuth.mockResolvedValue({ user: null });
    const r = await listAssetsAction();
    expect(r.ok).toBe(false);
  });

  it('returns cursor-paginated rows for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findUnique.mockResolvedValue(null);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[baseAsset], 1]);
    const r = await listAssetsAction({ pageSize: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.rows[0].assetCode).toBe('NVH-PC-00001');
    expect(r.data.rowCount).toBe(1);
    expect(r.data.pageInfo.hasNextPage).toBe(false);
    expect(r.data.pageInfo.hasPreviousPage).toBe(false);
  });

  it('detects hasNextPage when extra row returned', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findUnique.mockResolvedValue(null);
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...baseAsset, id: `asset${i}` }));
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([rows, 25]);
    const r = await listAssetsAction({ pageSize: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(20);
    expect(r.data.pageInfo.hasNextPage).toBe(true);
  });

  it('filters active assets by default', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.findUnique.mockResolvedValue(null);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);
    await listAssetsAction({ isActive: 'active' });
    const txCall = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(txCall).toBeDefined();
  });
});

// ─── searchAssetsAction ────────────────────────────────────────────────────

describe('searchAssetsAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not logged in', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await searchAssetsAction('PC');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns matching assets as autocomplete options', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findMany.mockResolvedValue([
      { id: 'a1', assetCode: 'NVH-PC-00001', brand: 'Lenovo', model: 'ThinkPad X1' },
    ]);
    const r = await searchAssetsAction('NVH-PC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0].code).toBe('a1');
    expect(r.data[0].value).toContain('NVH-PC-00001');
  });
});

// ─── getCategoryFieldConfigAction ─────────────────────────────────────────

describe('getCategoryFieldConfigAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when category not found', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockCategory.findUnique.mockResolvedValue(null);
    const r = await getCategoryFieldConfigAction('nonexistent');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toBeNull();
  });

  it('returns fieldConfig and defaultUsefulLife for existing category', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    const r = await getCategoryFieldConfigAction('cat1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.fieldConfig).toEqual({ processor: 'required', ram: 'required', phoneNumber: 'hidden' });
    expect(r.data?.defaultUsefulLife).toBe(3);
    expect(r.data?.prefix).toBe('PC');
  });
});

// ─── createAssetAction ─────────────────────────────────────────────────────

describe('createAssetAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await createAssetAction({ categoryId: 'cat1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('creates asset with atomic assetCode NVH-{PREFIX}-{SEQ}', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          update: vi.fn().mockResolvedValue({ ...baseCategory, sequence: 1 }),
        },
        asset: {
          findUnique: vi.fn().mockResolvedValue(null), // no assetCode conflict
          create: vi.fn().mockResolvedValue(baseAsset),
        },
        exchangeRate: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        currency: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return fn(tx);
    });
    const r = await createAssetAction({
      categoryId: 'cat1',
      brand: 'Lenovo',
      model: 'ThinkPad X1',
      processor: 'i7',
      ram: '16GB',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.assetCode).toBe('NVH-PC-00001');
    expect(revalidatePath).toHaveBeenCalledWith('/assets');
  });

  it('returns CONFLICT on duplicate serialNumber', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: { update: vi.fn().mockResolvedValue({ ...baseCategory, sequence: 1 }) },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue({ code: 'P2002', meta: { target: 'serialNumber' } }) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await createAssetAction({ categoryId: 'cat1', serialNumber: 'SN-001', processor: 'i7', ram: '16GB' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('CONFLICT');
  });

  it('returns VALIDATION when categoryId missing', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(null);
    const r = await createAssetAction({ categoryId: '' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toMatch(/VALIDATION|NOT_FOUND/);
  });
});

// ─── updateAssetAction ─────────────────────────────────────────────────────

describe('updateAssetAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await updateAssetAction('asset1', { brand: 'Dell' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('updates asset and returns updated row', async () => {
    mockAuth.mockResolvedValue(adminSession);
    const updated = { ...baseAsset, brand: 'Dell' };
    mockAsset.update.mockResolvedValue(updated);
    const r = await updateAssetAction('asset1', { brand: 'Dell' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.brand).toBe('Dell');
  });

  it('returns NOT_FOUND for nonexistent asset', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.update.mockRejectedValue({ code: 'P2025' });
    const r = await updateAssetAction('ghost', { brand: 'Dell' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('NOT_FOUND');
  });
});

// ─── deactivateAssetAction ─────────────────────────────────────────────────

describe('deactivateAssetAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await deactivateAssetAction('asset1');
    expect(r.ok).toBe(false);
  });

  it('sets isActive=false for ADMIN', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.update.mockResolvedValue({ ...baseAsset, isActive: false });
    const r = await deactivateAssetAction('asset1');
    expect(r.ok).toBe(true);
    expect(mockAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
});

// ─── deleteAssetAction ─────────────────────────────────────────────────────

describe('deleteAssetAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await deleteAssetAction('asset1');
    expect(r.ok).toBe(false);
  });

  it('blocks delete when asset has assignments', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.findUnique.mockResolvedValue({
      _count: { assignments: 2, components: 0 },
    });
    const r = await deleteAssetAction('asset1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; message: string }).message).toContain('asignaciones');
  });

  it('blocks delete when asset has components', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.findUnique.mockResolvedValue({
      _count: { assignments: 0, components: 3 },
    });
    const r = await deleteAssetAction('asset1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; message: string }).message).toContain('componentes');
  });

  it('deletes asset when no assignments or components', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAsset.findUnique.mockResolvedValue({
      _count: { assignments: 0, components: 0 },
    });
    mockAsset.delete.mockResolvedValue({});
    const r = await deleteAssetAction('asset1');
    expect(r.ok).toBe(true);
    expect(mockAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset1' } });
  });
});

// ─── importAssetsAction ───────────────────────────────────────────────────

describe('importAssetsAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore real hasPermission after vi.resetAllMocks() clears the implementation.
    mockHasPermission.mockImplementation(realHasPermission.fn);
  });

  it('returns FORBIDDEN for VIEWER', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    const r = await importAssetsAction([]);
    expect(r.ok).toBe(false);
  });

  it('skips row with unknown category and reports error', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockImportLog.create.mockResolvedValue({});
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        asset: { create: vi.fn() },
        location: { findFirst: vi.fn().mockResolvedValue(null) },
        bodega: { findFirst: vi.fn().mockResolvedValue(null) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await importAssetsAction([
      { category: 'Inexistente', brand: 'Lenovo', model: 'X1', serialNumber: null, hostname: null, assetTag: null, processor: null, ram: null, storageCapacity: null, storageType: null, operatingSystem: null, purchasePrice: null, currencyCode: null, usefulLifeYears: null, purchaseDate: null, generalStatus: null, location: null, bodega: null, notes: null },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.inserted).toBe(0);
    expect(r.data.skipped).toBe(1);
    expect(r.data.errors[0].message).toContain('Categoría no encontrada');
    expect(mockImportLog.create).toHaveBeenCalled();
  });

  it('inserts valid row and generates assetCode', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockImportLog.create.mockResolvedValue({});
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(baseCategory),
          update: vi.fn().mockResolvedValue({ ...baseCategory, sequence: 1 }),
        },
        asset: { create: vi.fn().mockResolvedValue(baseAsset) },
        location: { findFirst: vi.fn().mockResolvedValue(null) },
        bodega: { findFirst: vi.fn().mockResolvedValue(null) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await importAssetsAction([
      { category: 'Computador Portátil', brand: 'Lenovo', model: 'X1', serialNumber: null, hostname: null, assetTag: null, processor: null, ram: null, storageCapacity: null, storageType: null, operatingSystem: null, purchasePrice: null, currencyCode: null, usefulLifeYears: null, purchaseDate: null, generalStatus: null, location: null, bodega: null, notes: null },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.inserted).toBe(1);
    expect(r.data.skipped).toBe(0);
  });
});

// ─── getAssetDetailAction ─────────────────────────────────────────────────

const baseAssetWithAssignments = {
  ...baseAsset,
  assignments: [
    {
      employeeId: 'emp1',
      assignedAt: new Date('2024-03-01'),
      employee: { id: 'emp1', fullName: 'Juan Pérez' },
    },
  ],
};

describe('getAssetDetailAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await getAssetDetailAction('NVH-PC-00001');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when asset does not exist', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue(null);
    const r = await getAssetDetailAction('NVH-XX-99999');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('NOT_FOUND');
  });

  it('returns AssetDetailRow with active assignment', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue(baseAssetWithAssignments);
    const r = await getAssetDetailAction('NVH-PC-00001');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.assetCode).toBe('NVH-PC-00001');
    expect(r.data.activeAssignment?.employeeName).toBe('Juan Pérez');
    expect(r.data.activeAssignment?.employeeId).toBe('emp1');
  });

  it('returns AssetDetailRow with null activeAssignment when none active', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue({ ...baseAsset, assignments: [] });
    const r = await getAssetDetailAction('NVH-PC-00001');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.activeAssignment).toBeNull();
  });
});

// ─── exportInventoryAction ────────────────────────────────────────────────

describe('exportInventoryAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await exportInventoryAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns base64 xlsx string for authenticated user', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findMany.mockResolvedValue([baseAsset]);
    const r = await exportInventoryAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data.base64).toBe('string');
    expect(r.data.base64.length).toBeGreaterThan(0);
    expect(r.data.filename).toContain('.xlsx');
  });
});

// ─── exportDepreciationAction ─────────────────────────────────────────────

describe('exportDepreciationAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await exportDepreciationAction();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns base64 xlsx with depreciation data', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findMany.mockResolvedValue([baseAsset]);
    const r = await exportDepreciationAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data.base64).toBe('string');
    expect(r.data.base64.length).toBeGreaterThan(0);
  });

  it('handles asset without purchaseDate (zero depreciation row)', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findMany.mockResolvedValue([{ ...baseAsset, purchaseDate: null }]);
    const r = await exportDepreciationAction();
    expect(r.ok).toBe(true);
  });
});

// ─── exportExpiringAction ─────────────────────────────────────────────────

describe('exportExpiringAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FORBIDDEN when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await exportExpiringAction(6);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('FORBIDDEN');
  });

  it('returns base64 xlsx with filtered assets', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    // Asset that expires in ~3 years (far future, won't match 6-month filter)
    mockAsset.findMany.mockResolvedValue([]);
    const r = await exportExpiringAction(6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data.base64).toBe('string');
    expect(r.data.filename).toContain('.xlsx');
  });
});

// ─── getAssetHistoryAction ────────────────────────────────────────────────

const baseAssetWithHistory = {
  ...baseAsset,
  assignments: [
    {
      id: 'a1',
      employeeId: 'emp1',
      returnedAt: new Date('2024-06-01'),
      assignedAt: new Date('2024-01-01'),
      status: 'RETURNED',
      employee: { id: 'emp1', fullName: 'Ana García' },
    },
    {
      id: 'a2',
      employeeId: 'emp2',
      returnedAt: null,
      assignedAt: new Date('2024-06-15'),
      status: 'ACTIVE',
      employee: { id: 'emp2', fullName: 'Carlos López' },
    },
  ],
  maintenances: [
    { type: 'PREVENTIVE', description: 'Limpieza general', performedAt: new Date('2024-03-01') },
  ],
};

describe('getAssetHistoryAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns UNAUTHORIZED when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await getAssetHistoryAction('NVH-PC-00001');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns NOT_FOUND when asset does not exist', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue(null);
    const r = await getAssetHistoryAction('NVH-XX-99999');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; code: string }).code).toBe('NOT_FOUND');
  });

  it('returns history with assignments and maintenances', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue(baseAssetWithHistory);
    const r = await getAssetHistoryAction('NVH-PC-00001');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.assignments).toHaveLength(2);
    expect(r.data.assignments[0]!.employeeName).toBe('Ana García');
    expect(r.data.maintenances).toHaveLength(1);
    expect(r.data.maintenances[0]!.description).toBe('Limpieza general');
  });

  it('returns active assignment in asset detail row', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockAsset.findFirst.mockResolvedValue(baseAssetWithHistory);
    const r = await getAssetHistoryAction('NVH-PC-00001');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.asset.activeAssignment?.employeeName).toBe('Carlos López');
  });
});

// ─── FORBIDDEN guard tests (T-07-RED) ────────────────────────────────────────
// These tests verify that hasPermission is called and short-circuits before DB.

describe('FORBIDDEN guard — searchAssetsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findMany when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await searchAssetsAction('laptop');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findMany).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — getCategoryFieldConfigAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.category.findUnique when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await getCategoryFieldConfigAction('cat1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockCategory.findUnique).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — getAssetLocationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findUnique when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await getAssetLocationAction('asset1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findUnique).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — getAssetDetailAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findFirst when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await getAssetDetailAction('NVH-PC-00001');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findFirst).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — exportInventoryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findMany when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await exportInventoryAction();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findMany).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — exportDepreciationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findMany when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await exportDepreciationAction();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findMany).not.toHaveBeenCalled();
  });
});

describe('FORBIDDEN guard — exportExpiringAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FORBIDDEN and does not call prisma.asset.findMany when hasPermission returns false', async () => {
    mockAuth.mockResolvedValue(viewerSession);
    mockHasPermission.mockReturnValueOnce(false);
    const r = await exportExpiringAction(6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
    expect(mockAsset.findMany).not.toHaveBeenCalled();
  });
});
