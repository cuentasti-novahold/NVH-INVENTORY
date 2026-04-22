'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { countryCreateSchema, countryUpdateSchema } from './presentation/schemas/country.schema';
import { cityCreateSchema, cityUpdateSchema } from './presentation/schemas/city.schema';
import { locationCreateSchema, locationUpdateSchema } from './presentation/schemas/location.schema';
import { bodegaCreateSchema, bodegaUpdateSchema } from './presentation/schemas/bodega.schema';
import { toCountryRow } from './presentation/mappers/country.mapper';
import { toCityRow } from './presentation/mappers/city.mapper';
import { toLocationRow } from './presentation/mappers/location.mapper';
import { toBodegaRow } from './presentation/mappers/bodega.mapper';
import type { CountryRow, CreateCountryDTO, UpdateCountryDTO } from './presentation/dto/country.dto';
import type { CityRow, CreateCityDTO, UpdateCityDTO } from './presentation/dto/city.dto';
import type { LocationRow, CreateLocationDTO, UpdateLocationDTO } from './presentation/dto/location.dto';
import type { BodegaRow, CreateBodegaDTO, UpdateBodegaDTO } from './presentation/dto/bodega.dto';

type Role = Parameters<typeof hasPermission>[0];

async function requireWrite() {
  const session = await auth();
  if (!session?.user) return { error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Role, 'locations', 'create'))
    return { error: err('FORBIDDEN', 'Sin permiso') };
  return { session };
}

/* Helpers */
function isP2002(e: unknown, target: string): boolean {
  const prismaErr = e as { code?: string; meta?: { target?: string | string[] }; message?: string };
  if (prismaErr?.code !== 'P2002') return false;
  const t = prismaErr.meta?.target;
  if (typeof t === 'string') return t.includes(target);
  if (Array.isArray(t)) return t.includes(target);
  return typeof prismaErr.message === 'string' && prismaErr.message.includes(target);
}

function isP2025(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2025';
}

function yupToFieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const ve = e as { inner?: Array<{ path?: string; message: string }>; path?: string; message?: string };
  if (ve.inner?.length) {
    for (const i of ve.inner) if (i.path) out[i.path] = i.message;
  } else if (ve.path && ve.message) {
    out[ve.path] = ve.message;
  }
  return out;
}

/* ========== COUNTRIES ========== */

export async function listCountriesAction(): Promise<ActionResult<CountryRow[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'locations', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const rows = await prisma.country.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { cities: true } } },
  });
  return ok(rows.map(toCountryRow));
}

export async function searchCountriesAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const rows = await prisma.country.findMany({
    where: { name: { contains: query } },
    select: { id: true, name: true, code: true },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.name} (${r.code})` })));
}

export async function createCountryAction(
  input: CreateCountryDTO,
): Promise<ActionResult<CountryRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: CreateCountryDTO;
  try {
    dto = (await countryCreateSchema.validate(input, { abortEarly: false })) as CreateCountryDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.country.create({
      data: dto,
      include: { _count: { select: { cities: true } } },
    });
    revalidatePath('/settings/locations');
    return ok(toCountryRow(c));
  } catch (e) {
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe un país con este nombre' });
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe un país con este código' });
    return err('UNKNOWN', 'Error al crear país');
  }
}

export async function updateCountryAction(
  id: string,
  input: UpdateCountryDTO,
): Promise<ActionResult<CountryRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: UpdateCountryDTO;
  try {
    dto = (await countryUpdateSchema.validate(input, { abortEarly: false })) as UpdateCountryDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.country.update({
      where: { id },
      data: dto,
      include: { _count: { select: { cities: true } } },
    });
    revalidatePath('/settings/locations');
    return ok(toCountryRow(c));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'País no encontrado');
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe un país con este nombre' });
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe un país con este código' });
    return err('UNKNOWN', 'Error al actualizar país');
  }
}

export async function deleteCountryAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  const row = await prisma.country.findUnique({
    where: { id },
    select: { _count: { select: { cities: true } } },
  });
  if (!row) return err('NOT_FOUND', 'País no encontrado');

  if (row._count.cities > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.cities} ciudades asociadas`);

  await prisma.country.delete({ where: { id } });
  revalidatePath('/settings/locations');
  return ok(undefined);
}

/* ========== CITIES ========== */

export async function listCitiesAction(): Promise<ActionResult<CityRow[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'locations', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const rows = await prisma.city.findMany({
    orderBy: { name: 'asc' },
    include: { country: { select: { name: true } }, _count: { select: { locations: true } } },
  });
  return ok(rows.map(toCityRow));
}

export async function searchCitiesAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const rows = await prisma.city.findMany({
    where: { name: { contains: query } },
    select: { id: true, name: true, country: { select: { name: true } } },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.name}, ${r.country.name}` })));
}

export async function createCityAction(
  input: CreateCityDTO,
): Promise<ActionResult<CityRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: CreateCityDTO;
  try {
    dto = (await cityCreateSchema.validate(input, { abortEarly: false })) as CreateCityDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.city.create({
      data: { name: dto.name, country: { connect: { id: dto.countryId } } },
      include: { country: { select: { name: true } }, _count: { select: { locations: true } } },
    });
    revalidatePath('/settings/locations');
    return ok(toCityRow(c));
  } catch (e) {
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una ciudad con este nombre' });
    return err('UNKNOWN', 'Error al crear ciudad');
  }
}

export async function updateCityAction(
  id: string,
  input: UpdateCityDTO,
): Promise<ActionResult<CityRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: UpdateCityDTO;
  try {
    dto = (await cityUpdateSchema.validate(input, { abortEarly: false })) as UpdateCityDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.countryId !== undefined) data.country = { connect: { id: dto.countryId } };

  try {
    const c = await prisma.city.update({
      where: { id },
      data,
      include: { country: { select: { name: true } }, _count: { select: { locations: true } } },
    });
    revalidatePath('/settings/locations');
    return ok(toCityRow(c));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Ciudad no encontrada');
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una ciudad con este nombre' });
    return err('UNKNOWN', 'Error al actualizar ciudad');
  }
}

export async function deleteCityAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  const row = await prisma.city.findUnique({
    where: { id },
    select: { _count: { select: { locations: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Ciudad no encontrada');

  if (row._count.locations > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.locations} sedes asociadas`);

  await prisma.city.delete({ where: { id } });
  revalidatePath('/settings/locations');
  return ok(undefined);
}

/* ========== LOCATIONS (SEDES) ========== */

export async function listLocationsAction(): Promise<ActionResult<LocationRow[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'locations', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const rows = await prisma.location.findMany({
    orderBy: { name: 'asc' },
    include: {
      city: { select: { name: true, country: { select: { name: true } } } },
      _count: { select: { bodegas: true } },
    },
  });
  return ok(rows.map(toLocationRow));
}

export async function searchLocationsAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const rows = await prisma.location.findMany({
    where: { name: { contains: query } },
    select: { id: true, name: true, city: { select: { name: true } } },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.name} — ${r.city.name}` })));
}

export async function createLocationAction(
  input: CreateLocationDTO,
): Promise<ActionResult<LocationRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: CreateLocationDTO;
  try {
    dto = (await locationCreateSchema.validate(input, { abortEarly: false })) as CreateLocationDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const l = await prisma.location.create({
      data: {
        name: dto.name,
        address: dto.address ?? null,
        city: { connect: { id: dto.cityId } },
      },
      include: {
        city: { select: { name: true, country: { select: { name: true } } } },
        _count: { select: { bodegas: true } },
      },
    });
    revalidatePath('/settings/locations');
    return ok(toLocationRow(l));
  } catch (e) {
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una sede con este nombre' });
    return err('UNKNOWN', 'Error al crear sede');
  }
}

export async function updateLocationAction(
  id: string,
  input: UpdateLocationDTO,
): Promise<ActionResult<LocationRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: UpdateLocationDTO;
  try {
    dto = (await locationUpdateSchema.validate(input, { abortEarly: false })) as UpdateLocationDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.address !== undefined) data.address = dto.address ?? null;
  if (dto.cityId !== undefined) data.city = { connect: { id: dto.cityId } };

  try {
    const l = await prisma.location.update({
      where: { id },
      data,
      include: {
        city: { select: { name: true, country: { select: { name: true } } } },
        _count: { select: { bodegas: true } },
      },
    });
    revalidatePath('/settings/locations');
    return ok(toLocationRow(l));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Sede no encontrada');
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una sede con este nombre' });
    return err('UNKNOWN', 'Error al actualizar sede');
  }
}

export async function deleteLocationAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  const row = await prisma.location.findUnique({
    where: { id },
    select: { _count: { select: { bodegas: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Sede no encontrada');

  if (row._count.bodegas > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.bodegas} bodegas asociadas`);

  await prisma.location.delete({ where: { id } });
  revalidatePath('/settings/locations');
  return ok(undefined);
}

/* ========== BODEGAS ========== */

export async function listBodegasAction(): Promise<ActionResult<BodegaRow[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'locations', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const rows = await prisma.bodega.findMany({
    orderBy: { name: 'asc' },
    include: {
      location: { select: { name: true, city: { select: { name: true } } } },
      _count: { select: { assets: true } },
    },
  });
  return ok(rows.map(toBodegaRow));
}

export async function searchBodegasAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const rows = await prisma.bodega.findMany({
    where: { name: { contains: query } },
    select: { id: true, name: true, location: { select: { name: true } } },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.name} — ${r.location.name}` })));
}

export async function createBodegaAction(
  input: CreateBodegaDTO,
): Promise<ActionResult<BodegaRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: CreateBodegaDTO;
  try {
    dto = (await bodegaCreateSchema.validate(input, { abortEarly: false })) as CreateBodegaDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const b = await prisma.bodega.create({
      data: { name: dto.name, location: { connect: { id: dto.locationId } } },
      include: {
        location: { select: { name: true, city: { select: { name: true } } } },
        _count: { select: { assets: true } },
      },
    });
    revalidatePath('/settings/locations');
    return ok(toBodegaRow(b));
  } catch (e) {
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una bodega con este nombre' });
    return err('UNKNOWN', 'Error al crear bodega');
  }
}

export async function updateBodegaAction(
  id: string,
  input: UpdateBodegaDTO,
): Promise<ActionResult<BodegaRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: UpdateBodegaDTO;
  try {
    dto = (await bodegaUpdateSchema.validate(input, { abortEarly: false })) as UpdateBodegaDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.locationId !== undefined) data.location = { connect: { id: dto.locationId } };

  try {
    const b = await prisma.bodega.update({
      where: { id },
      data,
      include: {
        location: { select: { name: true, city: { select: { name: true } } } },
        _count: { select: { assets: true } },
      },
    });
    revalidatePath('/settings/locations');
    return ok(toBodegaRow(b));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Bodega no encontrada');
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una bodega con este nombre' });
    return err('UNKNOWN', 'Error al actualizar bodega');
  }
}

export async function deleteBodegaAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  const row = await prisma.bodega.findUnique({
    where: { id },
    select: { _count: { select: { assets: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Bodega no encontrada');

  if (row._count.assets > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.assets} activos asociados`);

  await prisma.bodega.delete({ where: { id } });
  revalidatePath('/settings/locations');
  return ok(undefined);
}

export async function searchBodegasByLocationAction(
  query: string,
  locationId?: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const rows = await prisma.bodega.findMany({
    where: {
      name: { contains: query },
      ...(locationId ? { locationId } : {}),
    },
    select: { id: true, name: true, location: { select: { name: true } } },
    take: 20,
    orderBy: { name: 'asc' },
  });

  return ok(rows.map((r) => ({ code: r.id, value: `${r.name} — ${r.location.name}` })));
}
