// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    company: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  createCompanyAction,
  deleteCompanyAction,
  searchCompaniesAction,
  updateCompanyAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockCompany = prisma.company as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeSession(role: string) {
  return { user: { id: 'u1', role } };
}

const sampleCompany = {
  id: 'cmp1',
  code: 'ARCHA',
  name: 'Archa S.A.',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { assets: 0, categorySequences: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─── createCompanyAction ─── */

describe('createCompanyAction', () => {
  it('retorna UNAUTHORIZED cuando no hay sesión', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await createCompanyAction({ code: 'ARCHA', name: 'Archa S.A.' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('retorna FORBIDDEN para rol TECHNICIAN', async () => {
    mockAuth.mockResolvedValue(makeSession('TECHNICIAN'));
    const result = await createCompanyAction({ code: 'ARCHA', name: 'Archa S.A.' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('crea empresa exitosamente con rol ADMIN', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        company: { create: vi.fn().mockResolvedValue(sampleCompany) },
      };
      return fn(txMock);
    });
    const result = await createCompanyAction({ code: 'ARCHA', name: 'Archa S.A.' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.code).toBe('ARCHA');
      expect(result.data.name).toBe('Archa S.A.');
    }
    expect(revalidatePath).toHaveBeenCalledWith('/settings/companies');
  });

  it('retorna CONFLICT con fieldErrors.code cuando Prisma lanza P2002 en code', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockTransaction.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['code'] },
    });
    const result = await createCompanyAction({ code: 'NVH', name: 'Duplicate' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.fieldErrors?.code).toBeDefined();
    }
  });

  it('retorna VALIDATION para code vacío', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const result = await createCompanyAction({ code: '', name: 'Test' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });
});

/* ─── deleteCompanyAction ─── */

describe('deleteCompanyAction', () => {
  it('retorna CONFLICT cuando assets._count > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue({
      _count: { assets: 3, categorySequences: 0 },
    });
    const result = await deleteCompanyAction('cmp1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('retorna CONFLICT cuando categorySequences._count > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue({
      _count: { assets: 0, categorySequences: 5 },
    });
    const result = await deleteCompanyAction('cmp1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('elimina exitosamente cuando no hay assets ni sequences', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue({
      _count: { assets: 0, categorySequences: 0 },
    });
    mockCompany.delete.mockResolvedValue({});
    const result = await deleteCompanyAction('cmp1');
    expect(result.ok).toBe(true);
    expect(mockCompany.delete).toHaveBeenCalledWith({ where: { id: 'cmp1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/companies');
  });

  it('retorna NOT_FOUND cuando empresa no existe', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue(null);
    const result = await deleteCompanyAction('cmp-nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

/* ─── updateCompanyAction — block code rename when assets exist ─── */

describe('updateCompanyAction', () => {
  it('bloquea cambio de code cuando hay assets asociados', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue({
      code: 'NVH',
      _count: { assets: 5 },
    });
    const result = await updateCompanyAction('cmp1', { code: 'NVHX', name: 'Novahold X' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.message).toContain('activos');
    }
  });

  it('permite rename de code cuando no hay assets', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCompany.findUnique.mockResolvedValue({ code: 'TEST', _count: { assets: 0 } });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        company: { update: vi.fn().mockResolvedValue({ ...sampleCompany, code: 'TST', name: 'Test Corp' }) },
      };
      return fn(txMock);
    });
    const result = await updateCompanyAction('cmp1', { code: 'TST', name: 'Test Corp' });
    expect(result.ok).toBe(true);
  });
});

/* ─── searchCompaniesAction — shape { code: r.id, value } ─── */

describe('searchCompaniesAction', () => {
  it('retorna UNAUTHORIZED cuando no hay sesión', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await searchCompaniesAction('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('devuelve items con shape { code: r.id, value: "CODE — Name" }', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCompany.findMany.mockResolvedValue([
      { id: 'cmp-uuid-1', code: 'NVH', name: 'Novahold' },
      { id: 'cmp-uuid-2', code: 'ARCHA', name: 'Archa S.A.' },
    ]);
    const result = await searchCompaniesAction('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // code field returns the UUID (id) so the autocomplete returns companyId
      expect(result.data[0]).toEqual({ code: 'cmp-uuid-1', value: 'NVH — Novahold' });
      expect(result.data[1]).toEqual({ code: 'cmp-uuid-2', value: 'ARCHA — Archa S.A.' });
    }
  });

  it('query vacía → where undefined (devuelve hasta 20 sin filtro)', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCompany.findMany.mockResolvedValue([]);
    await searchCompaniesAction('');
    const callArgs = mockCompany.findMany.mock.calls[0][0];
    expect(callArgs.where).toBeUndefined();
    expect(callArgs.take).toBe(20);
  });
});
