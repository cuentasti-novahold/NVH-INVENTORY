// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    country: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    city: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bodega: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
  createCountryAction,
  deleteCountryAction,
  searchCountriesAction,
  createCityAction,
  deleteCityAction,
  searchCitiesAction,
  createLocationAction,
  deleteLocationAction,
  searchLocationsAction,
  createBodegaAction,
  deleteBodegaAction,
  searchBodegasAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;

type MockedPrismaModel = {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockCountry = prisma.country as MockedPrismaModel;
const mockCity = prisma.city as MockedPrismaModel;
const mockLocation = prisma.location as MockedPrismaModel;
const mockBodega = prisma.bodega as MockedPrismaModel;

function makeSession(role: string) {
  return { user: { id: 'u1', role } };
}

// Valid UUID helpers
const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== COUNTRIES =====================

describe('createCountryAction', () => {
  it('happy path: returns ok:true with CountryRow', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCountry.create.mockResolvedValue({
      id: UUID_1,
      name: 'Colombia',
      code: 'CO',
      _count: { cities: 0 },
    });
    const result = await createCountryAction({ name: 'Colombia', code: 'CO' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Colombia');
      expect(result.data.citiesCount).toBe(0);
    }
  });

  it('returns CONFLICT with fieldErrors.code when P2002 on code', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCountry.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['code'] },
    });
    const result = await createCountryAction({ name: 'Colombia', code: 'CO' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.fieldErrors?.code).toBeDefined();
    }
  });
});

describe('deleteCountryAction', () => {
  it('returns HAS_CHILDREN when _count.cities > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCountry.findUnique.mockResolvedValue({ _count: { cities: 3 } });
    const result = await deleteCountryAction(UUID_1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });

  it('happy path: calls delete and revalidatePath', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCountry.findUnique.mockResolvedValue({ _count: { cities: 0 } });
    mockCountry.delete.mockResolvedValue({});
    const result = await deleteCountryAction(UUID_1);
    expect(result.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/settings/locations');
  });

  it('returns UNAUTHORIZED for unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await deleteCountryAction(UUID_1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });
});

describe('searchCountriesAction', () => {
  it('returns label "Colombia (CO)" format', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCountry.findMany.mockResolvedValue([
      { id: UUID_1, name: 'Colombia', code: 'CO' },
    ]);
    const result = await searchCountriesAction('Colom');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: UUID_1, value: 'Colombia (CO)' });
    }
  });
});

// ===================== CITIES =====================

describe('createCityAction', () => {
  it('happy path: returns ok:true with CityRow including countryName', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCity.create.mockResolvedValue({
      id: UUID_1,
      name: 'Bogotá',
      countryId: UUID_1,
      country: { name: 'Colombia' },
      _count: { locations: 0 },
    });
    const result = await createCityAction({ name: 'Bogotá', countryId: UUID_1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.countryName).toBe('Colombia');
    }
  });

  it('returns VALIDATION when countryId is empty', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const result = await createCityAction({ name: 'Bogotá', countryId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });
});

describe('deleteCityAction', () => {
  it('returns HAS_CHILDREN when _count.locations > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCity.findUnique.mockResolvedValue({ _count: { locations: 2 } });
    const result = await deleteCityAction(UUID_1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });
});

describe('searchCitiesAction', () => {
  it('returns label "Bogotá, Colombia" format', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCity.findMany.mockResolvedValue([
      { id: UUID_1, name: 'Bogotá', country: { name: 'Colombia' } },
    ]);
    const result = await searchCitiesAction('Bog');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: UUID_1, value: 'Bogotá, Colombia' });
    }
  });
});

// ===================== LOCATIONS (SEDES) =====================

describe('createLocationAction', () => {
  it('happy path: returns ok:true with LocationRow', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockLocation.create.mockResolvedValue({
      id: UUID_1,
      name: 'Oficina Central',
      address: 'Calle 123',
      cityId: UUID_1,
      city: { name: 'Bogotá', country: { name: 'Colombia' } },
      _count: { bodegas: 0 },
    });
    const result = await createLocationAction({ name: 'Oficina Central', cityId: UUID_1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cityName).toBe('Bogotá');
      expect(result.data.countryName).toBe('Colombia');
    }
  });

  it('returns FORBIDDEN for MANAGER role', async () => {
    mockAuth.mockResolvedValue(makeSession('MANAGER'));
    const result = await createLocationAction({ name: 'Oficina', cityId: UUID_1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });
});

describe('deleteLocationAction', () => {
  it('returns HAS_CHILDREN when _count.bodegas > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockLocation.findUnique.mockResolvedValue({ _count: { bodegas: 1 } });
    const result = await deleteLocationAction(UUID_1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });
});

describe('searchLocationsAction', () => {
  it('returns label "Oficina Central — Bogotá" format', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockLocation.findMany.mockResolvedValue([
      { id: UUID_1, name: 'Oficina Central', city: { name: 'Bogotá' } },
    ]);
    const result = await searchLocationsAction('Ofic');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: UUID_1, value: 'Oficina Central — Bogotá' });
    }
  });
});

// ===================== BODEGAS =====================

describe('createBodegaAction', () => {
  it('happy path: returns ok:true with BodegaRow', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockBodega.create.mockResolvedValue({
      id: UUID_1,
      name: 'Bodega Principal',
      locationId: UUID_1,
      location: { name: 'Oficina Central', city: { name: 'Bogotá' } },
      _count: { assets: 0 },
    });
    const result = await createBodegaAction({ name: 'Bodega Principal', locationId: UUID_1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.locationName).toBe('Oficina Central');
      expect(result.data.cityName).toBe('Bogotá');
    }
  });
});

describe('deleteBodegaAction', () => {
  it('returns HAS_CHILDREN when _count.assets > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockBodega.findUnique.mockResolvedValue({ _count: { assets: 5 } });
    const result = await deleteBodegaAction(UUID_1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });
});

describe('searchBodegasAction', () => {
  it('returns label "Bodega Principal — Oficina Central" format', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockBodega.findMany.mockResolvedValue([
      { id: UUID_1, name: 'Bodega Principal', location: { name: 'Oficina Central' } },
    ]);
    const result = await searchBodegasAction('Bod');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: UUID_1, value: 'Bodega Principal — Oficina Central' });
    }
  });
});
