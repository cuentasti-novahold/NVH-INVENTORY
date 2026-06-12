// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    currency: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    exchangeRate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  createCurrencyAction,
  deleteCurrencyAction,
  createExchangeRateAction,
  searchCurrenciesAction,
  searchCurrenciesByIdAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockCurrency = prisma.currency as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockExchangeRate = prisma.exchangeRate as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function makeSession(role: string) {
  return { user: { id: 'u1', role } };
}

const sampleCurrency = {
  id: 'curr1',
  code: 'COP',
  name: 'Peso colombiano',
  symbol: '$',
  isBase: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { assets: 0, exchangeRates: 0 },
};

const sampleExchangeRate = {
  id: 'er1',
  currencyId: 'curr1',
  rateToBase: { toString: () => '4200.500000' },
  effectiveDate: new Date('2026-06-01'),
  source: 'manual',
  currency: { code: 'USD', name: 'Dólar americano', symbol: 'US$' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─── T-8.1: createCurrencyAction con isBase:true llama updateMany antes de create ─── */

describe('createCurrencyAction', () => {
  it('llama updateMany({ isBase:true }) antes de create cuando isBase:true', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));

    // Simular $transaction interactiva: ejecuta el callback con un tx mock
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const createMock = vi.fn().mockResolvedValue({ ...sampleCurrency, isBase: true });
    const txMock = { currency: { updateMany: updateManyMock, create: createMock } };

    mockTransaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => {
      return fn(txMock);
    });

    const result = await createCurrencyAction({ code: 'USD', name: 'Dólar americano', symbol: 'US$', isBase: true });

    expect(result.ok).toBe(true);
    expect(updateManyMock).toHaveBeenCalledOnce();
    expect(updateManyMock).toHaveBeenCalledWith({ where: { isBase: true }, data: { isBase: false } });
    expect(createMock).toHaveBeenCalledOnce();
    // updateMany debe llamarse ANTES que create
    const updateManyOrder = updateManyMock.mock.invocationCallOrder[0];
    const createOrder = createMock.mock.invocationCallOrder[0];
    expect(updateManyOrder).toBeLessThan(createOrder);
  });

  it('NO llama updateMany cuando isBase:false', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));

    const updateManyMock = vi.fn();
    const createMock = vi.fn().mockResolvedValue(sampleCurrency);
    const txMock = { currency: { updateMany: updateManyMock, create: createMock } };

    mockTransaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => {
      return fn(txMock);
    });

    const result = await createCurrencyAction({ code: 'EUR', name: 'Euro', symbol: '€', isBase: false });

    expect(result.ok).toBe(true);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('retorna CONFLICT con fieldErrors.code cuando Prisma lanza P2002 en code', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));

    mockTransaction.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['code'] },
    });

    const result = await createCurrencyAction({ code: 'COP', name: 'Peso', symbol: '$', isBase: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.fieldErrors?.code).toBeDefined();
    }
  });
});

/* ─── T-8.2: deleteCurrencyAction ─── */

describe('deleteCurrencyAction', () => {
  it('retorna CONFLICT cuando la moneda es base', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCurrency.findUnique.mockResolvedValue({
      isBase: true,
      _count: { assets: 0, exchangeRates: 0 },
    });

    const result = await deleteCurrencyAction('curr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('retorna CONFLICT cuando _count.assets > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCurrency.findUnique.mockResolvedValue({
      isBase: false,
      _count: { assets: 3, exchangeRates: 0 },
    });

    const result = await deleteCurrencyAction('curr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('retorna CONFLICT cuando _count.exchangeRates > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCurrency.findUnique.mockResolvedValue({
      isBase: false,
      _count: { assets: 0, exchangeRates: 5 },
    });

    const result = await deleteCurrencyAction('curr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('retorna CONFLICT cuando Prisma lanza P2003', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCurrency.findUnique.mockResolvedValue({
      isBase: false,
      _count: { assets: 0, exchangeRates: 0 },
    });
    mockCurrency.delete.mockRejectedValue({ code: 'P2003' });

    const result = await deleteCurrencyAction('curr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');
  });

  it('happy path: llama delete y revalidatePath', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCurrency.findUnique.mockResolvedValue({
      isBase: false,
      _count: { assets: 0, exchangeRates: 0 },
    });
    mockCurrency.delete.mockResolvedValue({});

    const result = await deleteCurrencyAction('curr1');

    expect(result.ok).toBe(true);
    expect(mockCurrency.delete).toHaveBeenCalledWith({ where: { id: 'curr1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/currencies');
  });
});

/* ─── T-8.3: createExchangeRateAction — rateToBase como string, nunca parseFloat ─── */

describe('createExchangeRateAction', () => {
  it('pasa rateToBase como string sin parseFloat a prisma.exchangeRate.create', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockExchangeRate.create.mockResolvedValue(sampleExchangeRate);

    const result = await createExchangeRateAction({
      currencyId: 'curr1',
      rateToBase: '4200.500000',
      effectiveDate: '2026-06-01',
      source: 'manual',
    });

    expect(result.ok).toBe(true);
    const callArgs = mockExchangeRate.create.mock.calls[0][0];
    // rateToBase debe ser el string original, NUNCA un number (parseFloat)
    expect(typeof callArgs.data.rateToBase).toBe('string');
    expect(callArgs.data.rateToBase).toBe('4200.500000');
  });

  it('retorna NOT_FOUND cuando Prisma lanza P2025', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockExchangeRate.create.mockRejectedValue({ code: 'P2025' });

    const result = await createExchangeRateAction({
      currencyId: 'curr1',
      rateToBase: '4200.5',
      effectiveDate: '2026-06-01',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retorna VALIDATION error cuando rateToBase no es numérico', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));

    const result = await createExchangeRateAction({
      currencyId: 'curr1',
      rateToBase: 'no-es-numero',
      effectiveDate: '2026-06-01',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });
});

/* ─── T-8.4: searchCurrenciesAction — shape { code: r.code, value } ─── */

describe('searchCurrenciesAction', () => {
  it('devuelve items con shape { code: r.code, value } (NO el id)', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCurrency.findMany.mockResolvedValue([
      { id: 'curr-uuid-1', code: 'COP', name: 'Peso colombiano' },
      { id: 'curr-uuid-2', code: 'USD', name: 'Dólar americano' },
    ]);

    const result = await searchCurrenciesAction('');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: 'COP', value: 'COP — Peso colombiano' });
      expect(result.data[1]).toEqual({ code: 'USD', value: 'USD — Dólar americano' });
      // code es el code ISO, NO el id
      expect(result.data[0].code).not.toBe('curr-uuid-1');
    }
  });

  it('query vacía → where undefined (devuelve hasta 20 sin filtro)', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCurrency.findMany.mockResolvedValue([]);

    await searchCurrenciesAction('');

    const callArgs = mockCurrency.findMany.mock.calls[0][0];
    expect(callArgs.where).toBeUndefined();
    expect(callArgs.take).toBe(20);
  });

  it('retorna UNAUTHORIZED cuando no hay sesión', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await searchCurrenciesAction('');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });
});

/* ─── T-8.5: searchCurrenciesByIdAction — shape { code: r.id, value } ─── */

describe('searchCurrenciesByIdAction', () => {
  it('devuelve items con shape { code: r.id, value } (distinto de searchCurrenciesAction)', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCurrency.findMany.mockResolvedValue([
      { id: 'curr-uuid-1', code: 'COP', name: 'Peso colombiano' },
      { id: 'curr-uuid-2', code: 'USD', name: 'Dólar americano' },
    ]);

    const result = await searchCurrenciesByIdAction('');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // code es el UUID (id), NO el código ISO
      expect(result.data[0]).toEqual({ code: 'curr-uuid-1', value: 'COP — Peso colombiano' });
      expect(result.data[1]).toEqual({ code: 'curr-uuid-2', value: 'USD — Dólar americano' });
      expect(result.data[0].code).toBe('curr-uuid-1');
    }
  });

  it('el shape de code difiere de searchCurrenciesAction para el mismo input', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCurrency.findMany.mockResolvedValue([
      { id: 'curr-uuid-1', code: 'COP', name: 'Peso colombiano' },
    ]);

    // searchCurrencies: code = ISO code
    const byCode = await searchCurrenciesAction('COP');
    // searchCurrenciesById: code = UUID
    mockCurrency.findMany.mockResolvedValue([
      { id: 'curr-uuid-1', code: 'COP', name: 'Peso colombiano' },
    ]);
    const byId = await searchCurrenciesByIdAction('COP');

    if (byCode.ok && byId.ok) {
      expect(byCode.data[0].code).toBe('COP');       // ISO code
      expect(byId.data[0].code).toBe('curr-uuid-1'); // UUID
      expect(byCode.data[0].code).not.toBe(byId.data[0].code);
    }
  });
});
