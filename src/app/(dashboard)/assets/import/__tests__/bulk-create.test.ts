// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    importLog: { create: vi.fn() },
  },
}));
vi.mock('@/lib/location', () => ({ locationHasBodegas: vi.fn() }));
vi.mock('@/shared/excel-import/log', () => ({ writeImportLog: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '@/lib/prisma';
import { locationHasBodegas } from '@/lib/location';
import { bulkCreateAssets } from '../bulk-create';

const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockLocationHasBodegas = locationHasBodegas as ReturnType<typeof vi.fn>;

const baseCategory = { id: 'cat1', prefix: 'PC' };
const baseCompany = { id: 'cmp1', code: 'ARCHA', name: 'Archa S.A.' };
const baseLocation = { id: 'loc1' };

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    company: { findFirst: vi.fn().mockResolvedValue(baseCompany) },
    companyCategorySequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
    category: { findFirst: vi.fn().mockResolvedValue(baseCategory) },
    asset: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    location: { findFirst: vi.fn().mockResolvedValue(baseLocation) },
    bodega: { findFirst: vi.fn().mockResolvedValue(null) },
    exchangeRate: { findFirst: vi.fn().mockResolvedValue(null) },
    currency: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

const baseRow = {
  company: 'ARCHA',
  category: 'Computador Portátil',
  brand: 'Dell',
  model: 'Latitude',
  serialNumber: null,
  hostname: null,
  assetTag: null,
  processor: null,
  ram: null,
  storageCapacity: null,
  storageType: null,
  operatingSystem: null,
  purchasePrice: null,
  currencyCode: null,
  usefulLifeYears: null,
  purchaseDate: null,
  generalStatus: null,
  location: 'Sede Principal',
  bodega: null,
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLocationHasBodegas.mockResolvedValue(false);
});

describe('bulkCreateAssets — MAC-04: company resolution', () => {
  it('resolves company BEFORE category lookup', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    await bulkCreateAssets([baseRow], 'user1', 'test.xlsx');

    const companyCallOrder = (tx.company.findFirst as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const categoryCallOrder = (tx.category.findFirst as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(companyCallOrder).toBeLessThan(categoryCallOrder);
  });

  it('uses companyCategorySequence.upsert (not category.update)', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    await bulkCreateAssets([baseRow], 'user1', 'test.xlsx');

    expect((tx.companyCategorySequence.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((tx.companyCategorySequence.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_categoryId: { companyId: 'cmp1', categoryId: 'cat1' } },
      }),
    );
  });

  it('skips row and returns COMPANY_NOT_FOUND error when company does not exist', async () => {
    const tx = makeTx({
      company: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await bulkCreateAssets([{ ...baseRow, company: 'UNKNOWN' }], 'user1', 'test.xlsx');

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain('Empresa');
  });

  it('persists companyId on asset.create', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    await bulkCreateAssets([baseRow], 'user1', 'test.xlsx');

    expect((tx.asset.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'cmp1' }),
      }),
    );
  });

  it('generates asset code using company.code and category.prefix', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    await bulkCreateAssets([baseRow], 'user1', 'test.xlsx');

    const assetCreateCall = (tx.asset.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // code must be {companyCode}-{prefix}-{seq} format
    expect(assetCreateCall.data.assetCode).toMatch(/^ARCHA-PC-\d{5}$/);
  });
});
