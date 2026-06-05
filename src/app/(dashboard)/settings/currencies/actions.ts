'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { PageInfo } from '@/shared/types/pagination';
import { currencyCreateSchema, currencyUpdateSchema } from './presentation/schemas/currency.schema';
import { exchangeRateCreateSchema } from './presentation/schemas/exchange-rate.schema';
import { toCurrencyRow, currencyInclude } from './presentation/mappers/currency.mapper';
import { toExchangeRateRow, exchangeRateInclude } from './presentation/mappers/exchange-rate.mapper';
import type { CurrencyRow, CreateCurrencyDTO, UpdateCurrencyDTO } from './presentation/dto/currency.dto';
import type { ExchangeRateRow, CreateExchangeRateDTO } from './presentation/dto/exchange-rate.dto';

type Role = Parameters<typeof hasPermission>[0];

/* ========== Pagination types ========== */

export interface ListCurrenciesParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  q?: string;
}

export interface ListResult<T> {
  rows: T[];
  rowCount: number;
  pageInfo: PageInfo;
}

/* ========== Auth helpers ========== */

type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

async function requireWrite(): Promise<AuthCheck> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Role, 'currencies', 'create'))
    return { ok: false, error: err('FORBIDDEN', 'Sin permiso') };
  return { ok: true, userId: session.user.id as string };
}

/* ========== Error helpers ========== */

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

function isP2003(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2003';
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

/* ========== CURRENCIES ========== */

// T-3.1
export async function listCurrenciesAction(
  params: ListCurrenciesParams = {},
): Promise<ActionResult<ListResult<CurrencyRow>>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'currencies', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() || undefined;
  const qWhere = q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined;

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [{ createdAt: 'desc' }, { id: 'desc' }];

  if (afterCursor) {
    const pivot = await prisma.currency.findUnique({ where: { id: afterCursor }, select: { createdAt: true } });
    if (pivot) cursorWhere = { OR: [{ createdAt: { lt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { lt: afterCursor } }] };
  } else if (beforeCursor) {
    const pivot = await prisma.currency.findUnique({ where: { id: beforeCursor }, select: { createdAt: true } });
    if (pivot) { cursorWhere = { OR: [{ createdAt: { gt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { gt: beforeCursor } }] }; orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]; }
  }

  const hasCursor = Object.keys(cursorWhere).length > 0;
  const findWhere = hasCursor ? (qWhere ? { AND: [cursorWhere, qWhere] } : cursorWhere) : qWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.currency.findMany({ where: findWhere as never, orderBy, take: limit + 1, include: currencyInclude }),
    prisma.currency.count({ where: qWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;
  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  return ok({ rows: (data as typeof rows).map(toCurrencyRow), rowCount, pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit } });
}

// T-3.5 — devuelve code: r.code (para asset-form, FK → Currency.code)
export async function searchCurrenciesAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const q = query?.trim() || undefined;
  const rows = await prisma.currency.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined,
    select: { id: true, code: true, name: true },
    take: 20,
    orderBy: { code: 'asc' },
  });

  return ok(rows.map((r) => ({ code: r.code, value: `${r.code} — ${r.name}` })));
}

// T-3.6 — devuelve code: r.id (para exchange-rate form, FK → Currency.id)
export async function searchCurrenciesByIdAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const q = query?.trim() || undefined;
  const rows = await prisma.currency.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined,
    select: { id: true, code: true, name: true },
    take: 20,
    orderBy: { code: 'asc' },
  });

  return ok(rows.map((r) => ({ code: r.id, value: `${r.code} — ${r.name}` })));
}

// T-3.2
export async function createCurrencyAction(
  input: CreateCurrencyDTO,
): Promise<ActionResult<CurrencyRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: CreateCurrencyDTO;
  try {
    dto = (await currencyCreateSchema.validate(input, { abortEarly: false })) as CreateCurrencyDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.$transaction(async (tx) => {
      if (dto.isBase === true) {
        await tx.currency.updateMany({ where: { isBase: true }, data: { isBase: false } });
      }
      return tx.currency.create({ data: dto, include: currencyInclude });
    });
    revalidatePath('/settings/currencies');
    return ok(toCurrencyRow(c));
  } catch (e) {
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una moneda con este código' });
    return err('UNKNOWN', 'Error al crear moneda');
  }
}

// T-3.3
export async function updateCurrencyAction(
  id: string,
  input: UpdateCurrencyDTO,
): Promise<ActionResult<CurrencyRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: UpdateCurrencyDTO;
  try {
    dto = (await currencyUpdateSchema.validate(input, { abortEarly: false })) as UpdateCurrencyDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.$transaction(async (tx) => {
      if (dto.isBase === true) {
        await tx.currency.updateMany({ where: { isBase: true, NOT: { id } }, data: { isBase: false } });
      }
      return tx.currency.update({ where: { id }, data: dto, include: currencyInclude });
    });
    revalidatePath('/settings/currencies');
    return ok(toCurrencyRow(c));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una moneda con este código' });
    return err('UNKNOWN', 'Error al actualizar moneda');
  }
}

// T-3.4
export async function deleteCurrencyAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  const row = await prisma.currency.findUnique({
    where: { id },
    select: { isBase: true, _count: { select: { assets: true, exchangeRates: true } } },
  });

  if (!row) return err('NOT_FOUND', 'Moneda no encontrada');
  if (row.isBase) return err('CONFLICT', 'No se puede eliminar la moneda base');
  if (row._count.assets > 0)
    return err('CONFLICT', `No se puede eliminar: tiene ${row._count.assets} activos asociados`);
  if (row._count.exchangeRates > 0)
    return err('CONFLICT', `No se puede eliminar: tiene ${row._count.exchangeRates} tasas de cambio asociadas`);

  try {
    await prisma.currency.delete({ where: { id } });
    revalidatePath('/settings/currencies');
    return ok(undefined);
  } catch (e) {
    if (isP2003(e)) return err('CONFLICT', 'No se puede eliminar: tiene registros asociados');
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    return err('UNKNOWN', 'Error al eliminar moneda');
  }
}

/* ========== EXCHANGE RATES ========== */

// T-3.7
export async function listExchangeRatesAction(
  params: ListCurrenciesParams = {},
): Promise<ActionResult<ListResult<ExchangeRateRow>>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'currencies', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() || undefined;
  const qWhere = q ? { currency: { code: { contains: q } } } : undefined;

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [{ createdAt: 'desc' }, { id: 'desc' }];

  if (afterCursor) {
    const pivot = await prisma.exchangeRate.findUnique({ where: { id: afterCursor }, select: { createdAt: true } });
    if (pivot) cursorWhere = { OR: [{ createdAt: { lt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { lt: afterCursor } }] };
  } else if (beforeCursor) {
    const pivot = await prisma.exchangeRate.findUnique({ where: { id: beforeCursor }, select: { createdAt: true } });
    if (pivot) { cursorWhere = { OR: [{ createdAt: { gt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { gt: beforeCursor } }] }; orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]; }
  }

  const hasCursor = Object.keys(cursorWhere).length > 0;
  const findWhere = hasCursor ? (qWhere ? { AND: [cursorWhere, qWhere] } : cursorWhere) : qWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.exchangeRate.findMany({ where: findWhere as never, orderBy, take: limit + 1, include: exchangeRateInclude }),
    prisma.exchangeRate.count({ where: qWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;
  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  return ok({ rows: (data as typeof rows).map(toExchangeRateRow), rowCount, pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit } });
}

// T-3.8
export async function createExchangeRateAction(
  input: CreateExchangeRateDTO,
): Promise<ActionResult<ExchangeRateRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: CreateExchangeRateDTO;
  try {
    dto = (await exchangeRateCreateSchema.validate(input, { abortEarly: false })) as CreateExchangeRateDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const r = await prisma.exchangeRate.create({
      data: {
        currency: { connect: { id: dto.currencyId } },
        rateToBase: dto.rateToBase,   // string directo — NUNCA parseFloat
        effectiveDate: new Date(dto.effectiveDate),
        source: dto.source ?? null,
      },
      include: exchangeRateInclude,
    });
    revalidatePath('/settings/currencies');
    return ok(toExchangeRateRow(r));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    return err('UNKNOWN', 'Error al crear tasa de cambio');
  }
}
