'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { PageInfo } from '@/shared/types/pagination';
import { companyCreateSchema, companyUpdateSchema } from './presentation/schemas/company.schema';
import { toCompanyRow, companyInclude } from './presentation/mappers/company.mapper';
import type { CompanyRow, CreateCompanyDTO, UpdateCompanyDTO } from './presentation/dto/company.dto';

type Role = Parameters<typeof hasPermission>[0];

/* ========== Pagination types ========== */

export interface ListCompaniesParams {
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
  if (!hasPermission(session.user.role as Role, 'companies', 'create'))
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

/* ========== COMPANIES ========== */

export async function listCompaniesAction(
  params: ListCompaniesParams = {},
): Promise<ActionResult<ListResult<CompanyRow>>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'companies', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() || undefined;
  const qWhere = q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined;

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [{ createdAt: 'desc' }, { id: 'desc' }];

  if (afterCursor) {
    const pivot = await prisma.company.findUnique({ where: { id: afterCursor }, select: { createdAt: true } });
    if (pivot) cursorWhere = { OR: [{ createdAt: { lt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { lt: afterCursor } }] };
  } else if (beforeCursor) {
    const pivot = await prisma.company.findUnique({ where: { id: beforeCursor }, select: { createdAt: true } });
    if (pivot) { cursorWhere = { OR: [{ createdAt: { gt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { gt: beforeCursor } }] }; orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]; }
  }

  const hasCursor = Object.keys(cursorWhere).length > 0;
  const findWhere = hasCursor ? (qWhere ? { AND: [cursorWhere, qWhere] } : cursorWhere) : qWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.company.findMany({ where: findWhere as never, orderBy, take: limit + 1, include: companyInclude }),
    prisma.company.count({ where: qWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;
  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  return ok({ rows: (data as typeof rows).map(toCompanyRow), rowCount, pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit } });
}

// Returns { code: r.id, value: "CODE — Name" } so the autocomplete stores the companyId
export async function searchCompaniesAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const q = query?.trim() || undefined;
  const rows = await prisma.company.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined,
    select: { id: true, code: true, name: true },
    take: 20,
    orderBy: { code: 'asc' },
  });

  return ok(rows.map((r) => ({ code: r.id, value: `${r.code} — ${r.name}` })));
}

export async function createCompanyAction(
  input: CreateCompanyDTO,
): Promise<ActionResult<CompanyRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: CreateCompanyDTO;
  try {
    dto = (await companyCreateSchema.validate(input, { abortEarly: false, stripUnknown: true })) as CreateCompanyDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const c = await prisma.$transaction(async (tx) => {
      return tx.company.create({ data: dto, include: companyInclude });
    });
    revalidatePath('/settings/companies');
    return ok(toCompanyRow(c));
  } catch (e) {
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una empresa con este código' });
    return err('UNKNOWN', 'Error al crear empresa');
  }
}

export async function updateCompanyAction(
  id: string,
  input: UpdateCompanyDTO,
): Promise<ActionResult<CompanyRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: UpdateCompanyDTO;
  try {
    dto = (await companyUpdateSchema.validate(input, { abortEarly: false, stripUnknown: true })) as UpdateCompanyDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  // CM-02: block code rename when assets exist
  if (dto.code !== undefined) {
    const existing = await prisma.company.findUnique({
      where: { id },
      select: { code: true, _count: { select: { assets: true } } },
    });
    if (!existing) return err('NOT_FOUND', 'Empresa no encontrada');
    if (dto.code !== existing.code && existing._count.assets > 0) {
      return err('CONFLICT', 'No se puede cambiar el código mientras haya activos asociados');
    }
  }

  try {
    const c = await prisma.$transaction(async (tx) => {
      return tx.company.update({ where: { id }, data: dto, include: companyInclude });
    });
    revalidatePath('/settings/companies');
    return ok(toCompanyRow(c));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Empresa no encontrada');
    if (isP2002(e, 'code'))
      return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una empresa con este código' });
    return err('UNKNOWN', 'Error al actualizar empresa');
  }
}

export async function deleteCompanyAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  const row = await prisma.company.findUnique({
    where: { id },
    select: { _count: { select: { assets: true, categorySequences: true } } },
  });

  if (!row) return err('NOT_FOUND', 'Empresa no encontrada');
  if (row._count.assets > 0)
    return err('CONFLICT', `No se puede eliminar: tiene ${row._count.assets} activos asociados`);
  if (row._count.categorySequences > 0)
    return err('CONFLICT', `No se puede eliminar: tiene secuencias activas asociadas`);

  try {
    await prisma.company.delete({ where: { id } });
    revalidatePath('/settings/companies');
    return ok(undefined);
  } catch (e) {
    if (isP2003(e)) return err('CONFLICT', 'No se puede eliminar: tiene registros asociados');
    if (isP2025(e)) return err('NOT_FOUND', 'Empresa no encontrada');
    return err('UNKNOWN', 'Error al eliminar empresa');
  }
}
