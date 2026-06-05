'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { PageInfo } from '@/shared/types/pagination';
import { departmentCreateSchema, departmentUpdateSchema } from './presentation/schemas/department.schema';
import { toDepartmentRow, departmentInclude } from './presentation/mappers/department.mapper';
import type { DepartmentRow, CreateDepartmentDTO, UpdateDepartmentDTO } from './presentation/dto/department.dto';

type Role = Parameters<typeof hasPermission>[0];

/* ========== Pagination types ========== */

export interface ListDepartmentsParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  q?: string;
}

export interface ListDepartmentsResult {
  rows: DepartmentRow[];
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
  if (!hasPermission(session.user.role as Role, 'departments', 'create'))
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

/* ========== DEPARTMENTS ========== */

export async function listDepartmentsAction(
  params: ListDepartmentsParams = {},
): Promise<ActionResult<ListDepartmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'departments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() || undefined;
  const qWhere = q ? { name: { contains: q } } : undefined;

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [{ createdAt: 'desc' }, { id: 'desc' }];

  if (afterCursor) {
    const pivot = await prisma.department.findUnique({ where: { id: afterCursor }, select: { createdAt: true } });
    if (pivot) cursorWhere = { OR: [{ createdAt: { lt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { lt: afterCursor } }] };
  } else if (beforeCursor) {
    const pivot = await prisma.department.findUnique({ where: { id: beforeCursor }, select: { createdAt: true } });
    if (pivot) { cursorWhere = { OR: [{ createdAt: { gt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { gt: beforeCursor } }] }; orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]; }
  }

  const hasCursor = Object.keys(cursorWhere).length > 0;
  const findWhere = hasCursor ? (qWhere ? { AND: [cursorWhere, qWhere] } : cursorWhere) : qWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.department.findMany({ where: findWhere as never, orderBy, take: limit + 1, include: departmentInclude }),
    prisma.department.count({ where: qWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;
  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  return ok({ rows: (data as typeof rows).map(toDepartmentRow), rowCount, pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit } });
}

export async function searchDepartmentsAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const rows = await prisma.department.findMany({
    where: query.trim() ? { name: { contains: query.trim() } } : undefined,
    select: { id: true, name: true },
    take: 20,
    orderBy: { name: 'asc' },
  });

  return ok(rows.map((r) => ({ code: r.id, value: r.name })));
}

export async function createDepartmentAction(
  input: CreateDepartmentDTO,
): Promise<ActionResult<DepartmentRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: CreateDepartmentDTO;
  try {
    dto = (await departmentCreateSchema.validate(input, { abortEarly: false })) as CreateDepartmentDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const d = await prisma.department.create({ data: dto, include: departmentInclude });
    revalidatePath('/settings/departments');
    return ok(toDepartmentRow(d));
  } catch (e) {
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe un departamento con este nombre' });
    return err('UNKNOWN', 'Error al crear departamento');
  }
}

export async function updateDepartmentAction(
  id: string,
  input: UpdateDepartmentDTO,
): Promise<ActionResult<DepartmentRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: UpdateDepartmentDTO;
  try {
    dto = (await departmentUpdateSchema.validate(input, { abortEarly: false })) as UpdateDepartmentDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const d = await prisma.department.update({ where: { id }, data: dto, include: departmentInclude });
    revalidatePath('/settings/departments');
    return ok(toDepartmentRow(d));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Departamento no encontrado');
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe un departamento con este nombre' });
    return err('UNKNOWN', 'Error al actualizar departamento');
  }
}

export async function deleteDepartmentAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  const row = await prisma.department.findUnique({
    where: { id },
    select: { _count: { select: { employees: true } } },
  });

  if (!row) return err('NOT_FOUND', 'Departamento no encontrado');
  if (row._count.employees > 0)
    return err('CONFLICT', `No se puede eliminar: tiene ${row._count.employees} empleado(s) asociado(s)`);

  try {
    await prisma.department.delete({ where: { id } });
    revalidatePath('/settings/departments');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Departamento no encontrado');
    return err('UNKNOWN', 'Error al eliminar departamento');
  }
}
