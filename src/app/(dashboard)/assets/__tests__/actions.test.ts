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
    bodega: { findFirst: vi.fn(), count: vi.fn() },
    currency: { findUnique: vi.fn() },
    exchangeRate: { findFirst: vi.fn() },
    importLog: { create: vi.fn() },
    company: { findUnique: vi.fn(), findFirst: vi.fn() },
    companyCategorySequence: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DEACTIVATE: 'DEACTIVATE',
    DELETE: 'DELETE',
  },
  getRequestMeta: vi.fn().mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' }),
}));
vi.mock('@/lib/location', () => ({ locationHasBodegas: vi.fn() }));
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
import { writeAudit, getRequestMeta } from '@/lib/audit';
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
import { locationHasBodegas } from '@/lib/location';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockHasPermission = hasPermission as ReturnType<typeof vi.fn>;
const mockAsset = prisma.asset as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockCategory = prisma.category as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockImportLog = prisma.importLog as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockLocationHasBodegas = locationHasBodegas as ReturnType<typeof vi.fn>;
const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;
const mockWriteAuditGlobal = writeAudit as ReturnType<typeof vi.fn>;

// Restore mocks cleared by vi.clearAllMocks() in nested beforeEach blocks.
beforeEach(() => {
  mockHasPermission.mockImplementation(realHasPermission.fn);
  mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
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
  companyId: 'cmp1',
  company: { id: 'cmp1', code: 'NVH', name: 'Novahold' },
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

  it('creates asset with atomic assetCode {COMPANY}-{PREFIX}-{SEQ}', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }),
        },
        companyCategorySequence: {
          upsert: vi.fn().mockResolvedValue({ sequence: 1 }),
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
    mockLocationHasBodegas.mockResolvedValue(false);
    const r = await createAssetAction({
      companyId: 'cmp1',
      categoryId: 'cat1',
      brand: 'Lenovo',
      model: 'ThinkPad X1',
      processor: 'i7',
      ram: '16GB',
      locationId: 'loc-1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.assetCode).toBe('NVH-PC-00001');
    expect(revalidatePath).toHaveBeenCalledWith('/assets');
  });

  it('returns CONFLICT on duplicate serialNumber', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    mockLocationHasBodegas.mockResolvedValue(false);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue({ code: 'P2002', meta: { target: 'serialNumber' } }) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await createAssetAction({ companyId: 'cmp1', categoryId: 'cat1', serialNumber: 'SN-001', processor: 'i7', ram: '16GB', locationId: 'loc-1' });
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
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          asset: {
            findUnique: vi.fn().mockResolvedValue({ assetCode: 'NVH-PC-00001', categoryId: 'cat1', locationId: null, bodegaId: null }),
            update: vi.fn().mockResolvedValue(updated),
          },
        };
        return fn(tx);
      },
    );
    const r = await updateAssetAction('asset1', { brand: 'Dell' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.brand).toBe('Dell');
  });

  it('returns NOT_FOUND for nonexistent asset', async () => {
    mockAuth.mockResolvedValue(adminSession);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          asset: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      },
    );
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
    const txUpdate = vi.fn().mockResolvedValue({ ...baseAsset, isActive: false });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { asset: { update: txUpdate } };
        return fn(tx);
      },
    );
    const r = await deactivateAssetAction('asset1');
    expect(r.ok).toBe(true);
    expect(txUpdate).toHaveBeenCalledWith(
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
    // First findUnique is the HAS_CHILDREN guard (outer, not in tx)
    mockAsset.findUnique.mockResolvedValue({
      _count: { assignments: 0, components: 0 },
    });
    const txDelete = vi.fn().mockResolvedValue({});
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          asset: {
            findUnique: vi.fn().mockResolvedValue({ assetCode: 'NVH-PC-00001', categoryId: 'cat1', locationId: null }),
            delete: txDelete,
          },
        };
        return fn(tx);
      },
    );
    const r = await deleteAssetAction('asset1');
    expect(r.ok).toBe(true);
    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'asset1' } });
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
        company: { findFirst: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        location: { findFirst: vi.fn().mockResolvedValue(null) },
        bodega: { findFirst: vi.fn().mockResolvedValue(null) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await importAssetsAction([
      { company: 'NVH', category: 'Inexistente', brand: 'Lenovo', model: 'X1', serialNumber: null, hostname: null, assetTag: null, processor: null, ram: null, storageCapacity: null, storageType: null, operatingSystem: null, purchasePrice: null, currencyCode: null, usefulLifeYears: null, purchaseDate: null, generalStatus: null, location: null, bodega: null, notes: null },
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
        company: { findFirst: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        category: {
          findFirst: vi.fn().mockResolvedValue(baseCategory),
        },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(baseAsset) },
        location: { findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }) },
        bodega: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    // Now location is required; provide a valid location name
    // bodega count returns 0 so BODEGA_REQUIRED guard is not triggered
    const r = await importAssetsAction([
      { company: 'NVH', category: 'Computador Portátil', brand: 'Lenovo', model: 'X1', serialNumber: null, hostname: null, assetTag: null, processor: null, ram: null, storageCapacity: null, storageType: null, operatingSystem: null, purchasePrice: null, currencyCode: null, usefulLifeYears: null, purchaseDate: null, generalStatus: null, location: 'Sede Principal', bodega: null, notes: null },
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

// ─── Audit — S-05: createAssetAction writes CREATE audit ──────────────────

describe('createAssetAction audit — S-05', () => {
  const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
  const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
    mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
    mockWriteAudit.mockResolvedValue(undefined);
  });

  it('calls writeAudit with action=CREATE, assetId set, before=null, after.assetCode present', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    mockLocationHasBodegas.mockResolvedValue(false);

    const createdAsset = {
      ...baseAsset,
      id: 'asset-1',
      assetCode: 'NVH-TEC-00001',
      categoryId: 'cat-1',
      locationId: 'loc-1',
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
          companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
          asset: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdAsset),
          },
          exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
          currency: { findUnique: vi.fn().mockResolvedValue(null) },
        };
        return fn(tx);
      },
    );

    const r = await createAssetAction({ companyId: 'cmp1', categoryId: 'cat-1', locationId: 'loc-1', processor: 'i7', ram: '16GB' });
    expect(r.ok).toBe(true);

    expect(mockWriteAudit).toHaveBeenCalledOnce();
    const [, params] = mockWriteAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(params.action).toBe('CREATE');
    expect(params.entity).toBe('Asset');
    expect(params.entityId).toBe('asset-1');
    expect(params.assetId).toBe('asset-1');
    expect(params.before).toBeNull();
    expect((params.after as Record<string, unknown>).assetCode).toBe('NVH-TEC-00001');
    expect(params.ip).toBe('1.1.1.1');
  });
});

// ─── Audit — S-06: updateAssetAction captures before/after diff ──────────

describe('updateAssetAction audit — S-06', () => {
  const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
  const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
    mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
    mockWriteAudit.mockResolvedValue(undefined);
  });

  it('calls writeAudit with action=UPDATE and correct before/after locationId diff', async () => {
    mockAuth.mockResolvedValue(adminSession);

    const beforeSnapshot = {
      assetCode: 'NVH-TEC-00001',
      categoryId: 'cat-1',
      locationId: 'loc-old',
      bodegaId: null,
    };
    const updatedAsset = { ...baseAsset, locationId: 'loc-new', bodegaId: null };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          asset: {
            findUnique: vi.fn().mockResolvedValue(beforeSnapshot),
            update: vi.fn().mockResolvedValue(updatedAsset),
          },
        };
        return fn(tx);
      },
    );

    const r = await updateAssetAction('asset-1', { locationId: 'loc-new' });
    expect(r.ok).toBe(true);

    expect(mockWriteAudit).toHaveBeenCalledOnce();
    const [, params] = mockWriteAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(params.action).toBe('UPDATE');
    expect(params.entity).toBe('Asset');
    expect((params.before as Record<string, unknown>).locationId).toBe('loc-old');
    expect((params.after as Record<string, unknown>).locationId).toBe('loc-new');
  });
});

// ─── Audit — S-07: updateAssetAction rolls back when audit write fails ────

describe('updateAssetAction audit — S-07', () => {
  const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
  const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
    mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
  });

  it('returns err(UNKNOWN) when writeAudit throws inside $transaction', async () => {
    mockAuth.mockResolvedValue(adminSession);

    const beforeSnapshot = {
      assetCode: 'NVH-TEC-00001',
      categoryId: 'cat-1',
      locationId: 'loc-old',
      bodegaId: null,
    };
    const updatedAsset = { ...baseAsset, locationId: 'loc-new' };

    // Real callback runner so thrown error propagates as err('UNKNOWN')
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          asset: {
            findUnique: vi.fn().mockResolvedValue(beforeSnapshot),
            update: vi.fn().mockResolvedValue(updatedAsset),
          },
        };
        return fn(tx);
      },
    );

    // writeAudit throws — simulates DB_WRITE_FAIL propagating out of $transaction
    mockWriteAudit.mockRejectedValue(new Error('DB_WRITE_FAIL'));

    const r = await updateAssetAction('asset-1', { locationId: 'loc-new' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('UNKNOWN');
  });
});

// ─── T-01-B: createAssetAction rejects missing locationId ─────────────────────

describe('createAssetAction — locationId required (T-01-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
  });

  it('returns VALIDATION with fieldErrors.locationId when locationId is absent', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    const r = await createAssetAction({ categoryId: 'cat1' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('VALIDATION');
    expect(r.fieldErrors?.locationId).toBeDefined();
  });

  it('returns VALIDATION with fieldErrors.locationId when locationId is empty string', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue(baseCategory);
    const r = await createAssetAction({ categoryId: 'cat1', locationId: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('VALIDATION');
    expect(r.fieldErrors?.locationId).toBeDefined();
  });
});

// ─── T-02-B/C: createAssetAction bodega guard ─────────────────────────────────

describe('createAssetAction — conditional bodega guard (T-02-B / T-02-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
    mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
    mockWriteAuditGlobal.mockResolvedValue(undefined);
  });

  it('T-02-B: returns VALIDATION with fieldErrors.bodegaId when location has bodegas and bodegaId absent', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(true);
    const r = await createAssetAction({ companyId: 'cmp1', categoryId: 'cat1', locationId: 'loc-1' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('VALIDATION');
    expect(r.fieldErrors?.bodegaId).toBeDefined();
  });

  it('T-02-C: succeeds (no bodega error) when location has zero bodegas', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(false);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        asset: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(baseAsset),
        },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });
    const r = await createAssetAction({ companyId: 'cmp1', categoryId: 'cat1', locationId: 'loc-no-bodegas' });
    expect(r.ok).toBe(true);
  });
});

// ─── T-5.1: createAssetAction — multi-company asset code (MAC-01, MAC-02, ACG-01) ─────
// RED phase: these tests assert the new multi-company behavior.
// They will FAIL until createAssetAction is refactored to use nextAssetCode.

describe('createAssetAction — multi-company asset code (T-5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(realHasPermission.fn);
    mockGetRequestMeta.mockResolvedValue({ ip: '1.1.1.1', userAgent: 'ua' });
    mockWriteAuditGlobal.mockResolvedValue(undefined);
  });

  it('calls companyCategorySequence.upsert with correct companyId_categoryId key', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(false);

    const upsertMock = vi.fn().mockResolvedValue({ sequence: 1 });
    const assetFindUniqueMock = vi.fn().mockResolvedValue(null);
    const assetCreateMock = vi.fn().mockResolvedValue({
      ...baseAsset,
      companyId: 'cmp1',
      company: { id: 'cmp1', code: 'ARCHA', name: 'Archa S.A.' },
    });
    const companyFindUniqueMock = vi.fn().mockResolvedValue({ id: 'cmp1', code: 'ARCHA', name: 'Archa S.A.' });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: companyFindUniqueMock },
        companyCategorySequence: { upsert: upsertMock },
        asset: { findUnique: assetFindUniqueMock, create: assetCreateMock },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const r = await createAssetAction({ categoryId: 'cat1', companyId: 'cmp1', locationId: 'loc-1' });
    expect(r.ok).toBe(true);

    // companyCategorySequence.upsert MUST be called (not category.update for sequence)
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_categoryId: { companyId: 'cmp1', categoryId: 'cat1' } },
      }),
    );
  });

  it('does NOT call category.update for sequence increment', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(false);

    const categoryUpdateMock = vi.fn();

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'ARCHA' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        category: { update: categoryUpdateMock },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ ...baseAsset, companyId: 'cmp1', company: { id: 'cmp1', code: 'ARCHA', name: 'Archa S.A.' } }) },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await createAssetAction({ categoryId: 'cat1', companyId: 'cmp1', locationId: 'loc-1' });

    // category.update must NOT be called for sequence (ACG-01: sequence source is the junction)
    expect(categoryUpdateMock).not.toHaveBeenCalled();
  });

  it('generates asset code as {companyCode}-{prefix}-00001 format', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(false);

    const assetCreateMock = vi.fn().mockResolvedValue({
      ...baseAsset,
      assetCode: 'ARCHA-PC-00001',
      companyId: 'cmp1',
      company: { id: 'cmp1', code: 'ARCHA', name: 'Archa S.A.' },
    });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'ARCHA' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: assetCreateMock },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const r = await createAssetAction({ categoryId: 'cat1', companyId: 'cmp1', locationId: 'loc-1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // assetCode must use ARCHA prefix (not hardcoded NVH)
    expect(r.data.assetCode).toBe('ARCHA-PC-00001');
    expect(r.data.assetCode).not.toMatch(/^NVH-/);
  });

  it('persists companyId on asset.create (MAC-03)', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockCategory.findUnique.mockResolvedValue({ ...baseCategory, fieldConfig: {} });
    mockLocationHasBodegas.mockResolvedValue(false);

    const assetCreateMock = vi.fn().mockResolvedValue({
      ...baseAsset,
      companyId: 'cmp1',
      company: { id: 'cmp1', code: 'NVH', name: 'Novahold' },
    });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: 'cmp1', code: 'NVH' }) },
        companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
        asset: { findUnique: vi.fn().mockResolvedValue(null), create: assetCreateMock },
        exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
        currency: { findUnique: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await createAssetAction({ categoryId: 'cat1', companyId: 'cmp1', locationId: 'loc-1' });

    // asset.create must receive companyId
    expect(assetCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'cmp1' }),
      }),
    );
  });
});
