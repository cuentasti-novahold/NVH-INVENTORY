'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { categoryCreateSchema, categoryUpdateSchema } from './presentation/schemas/category.schema';
import { toCategoryRow } from './presentation/mappers/category.mapper';
import type { CategoryRow, CreateCategoryDTO, UpdateCategoryDTO } from './presentation/dto/category.dto';

const INCLUDE = {
  parent: { select: { name: true } },
  _count: { select: { children: true, assets: true } },
} as const;

async function requireWrite() {
  const session = await auth();
  if (!session?.user) return { error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Parameters<typeof hasPermission>[0], 'categories', 'create'))
    return { error: err('FORBIDDEN', 'Sin permiso') };
  return { session };
}

import type { PageInfo } from '@/shared/types/pagination';

export interface ListCategoriesParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  q?: string;
}

export interface ListCategoriesResult {
  rows: CategoryRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listCategoriesAction(
  params: ListCategoriesParams = {},
): Promise<ActionResult<ListCategoriesResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Parameters<typeof hasPermission>[0], 'categories', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() ?? '';

  const filterWhere: Record<string, unknown> = {};
  if (q.length > 0) {
    filterWhere.OR = [
      { name: { contains: q } },
      { prefix: { contains: q } },
    ];
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.category.findUnique({
      where: { id: afterCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { lt: afterCursor } },
        ],
      };
    }
  } else if (beforeCursor) {
    const pivot = await prisma.category.findUnique({
      where: { id: beforeCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { gt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { gt: beforeCursor } },
        ],
      };
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
    }
  }

  const hasFilter = Object.keys(filterWhere).length > 0;
  const hasCursor = Object.keys(cursorWhere).length > 0;
  const finalWhere = hasFilter && hasCursor
    ? { AND: [cursorWhere, filterWhere] }
    : hasCursor
      ? cursorWhere
      : filterWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.category.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: INCLUDE,
    }),
    prisma.category.count({ where: filterWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({
    rows: (data as any[]).map(toCategoryRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

export async function searchCategoriesAction(
  query: string,
  excludeId?: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const excludeIds = excludeId ? await collectDescendantIds(excludeId) : new Set<string>();

  const rows = await prisma.category.findMany({
    where: {
      name: { contains: query },
      id: excludeIds.size ? { notIn: [...excludeIds] } : undefined,
    },
    select: { id: true, name: true, prefix: true },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.name} (${r.prefix})` })));
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const childrenMap = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    const arr = childrenMap.get(c.parentId) ?? [];
    arr.push(c.id);
    childrenMap.set(c.parentId, arr);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenMap.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

export async function createCategoryAction(
  input: CreateCategoryDTO,
): Promise<ActionResult<CategoryRow>> {
  const guard = await requireWrite();
  if ('error' in guard) return guard.error;

  let dto: CreateCategoryDTO;
  try {
    dto = (await categoryCreateSchema.validate(input, { abortEarly: false })) as CreateCategoryDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const created = await prisma.category.create({
      data: {
        name: dto.name,
        prefix: dto.prefix,
        description: dto.description ?? null,
        defaultUsefulLife: dto.defaultUsefulLife ?? null,
        fieldConfig: dto.fieldConfig ?? undefined,
        sequence: 0,
        ...(dto.parentId ? { parent: { connect: { id: dto.parentId } } } : {}),
      },
      include: INCLUDE,
    });
    revalidatePath('/settings/categories');
    return ok(toCategoryRow(created));
  } catch (e: unknown) {
    console.error('[createCategoryAction] Prisma error:', JSON.stringify(e, null, 2));
    if (isP2002(e, 'prefix'))
      return err('CONFLICT', 'Prefijo duplicado', { prefix: 'Ya existe una categoría con este prefijo' });
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una categoría con este nombre' });
    return err('UNKNOWN', 'Error al crear categoría');
  }
}

export async function updateCategoryAction(
  id: string,
  input: UpdateCategoryDTO,
): Promise<ActionResult<CategoryRow>> {
  const guard = await requireWrite();
  if ('error' in guard) return guard.error;

  const existing = await prisma.category.findUnique({
    where: { id },
    select: { id: true, parentId: true, prefix: true, _count: { select: { assets: true } } },
  });
  if (!existing) return err('NOT_FOUND', 'Categoría no encontrada');

  let dto: UpdateCategoryDTO;
  try {
    dto = (await categoryUpdateSchema.validate(input, { abortEarly: false })) as UpdateCategoryDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  // prefix immutability guard
  if (dto.prefix && dto.prefix !== existing.prefix && existing._count.assets > 0)
    return err('IMMUTABLE', 'No se puede cambiar el prefijo de una categoría con activos', {
      prefix: 'Prefijo bloqueado: existen activos',
    });

  // cycle guard
  if (dto.parentId) {
    if (dto.parentId === id)
      return err('CYCLE', 'Una categoría no puede ser su propia padre', { parentId: 'Selección inválida' });
    const descendants = await collectDescendantIds(id);
    if (descendants.has(dto.parentId))
      return err('CYCLE', 'Ciclo detectado: el padre es descendiente', { parentId: 'Selección inválida' });
  }

  try {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.prefix !== undefined && existing._count.assets === 0) data.prefix = dto.prefix;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.defaultUsefulLife !== undefined) data.defaultUsefulLife = dto.defaultUsefulLife ?? null;
    if (dto.fieldConfig !== undefined) data.fieldConfig = dto.fieldConfig ?? null;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId ? { connect: { id: dto.parentId } } : { disconnect: true };
    }
    const updated = await prisma.category.update({ where: { id }, data, include: INCLUDE });
    revalidatePath('/settings/categories');
    return ok(toCategoryRow(updated));
  } catch (e: unknown) {
    if (isP2025(e)) return err('NOT_FOUND', 'Categoría no encontrada');
    if (isP2002(e, 'prefix'))
      return err('CONFLICT', 'Prefijo duplicado', { prefix: 'Ya existe una categoría con este prefijo' });
    if (isP2002(e, 'name'))
      return err('CONFLICT', 'Nombre duplicado', { name: 'Ya existe una categoría con este nombre' });
    return err('UNKNOWN', 'Error al actualizar categoría');
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<void>> {
  const guard = await requireWrite();
  if ('error' in guard) return guard.error;

  const row = await prisma.category.findUnique({
    where: { id },
    select: { _count: { select: { children: true, assets: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Categoría no encontrada');

  if (row._count.children > 0 || row._count.assets > 0) {
    const parts: string[] = [];
    if (row._count.children > 0) parts.push(`${row._count.children} subcategorías`);
    if (row._count.assets > 0) parts.push(`${row._count.assets} activos`);
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${parts.join(' y ')}`);
  }

  await prisma.category.delete({ where: { id } });
  revalidatePath('/settings/categories');
  return ok(undefined);
}

/* Helpers */
function isP2002(e: unknown, target: string): boolean {
  const prismaErr = e as { code?: string; meta?: { target?: string | string[]; modelName?: string }; message?: string };
  if (prismaErr?.code !== 'P2002') return false;
  const t = prismaErr.meta?.target;
  if (typeof t === 'string') return t.includes(target);
  if (Array.isArray(t)) return t.includes(target);
  // Fallback: MariaDB adapter may omit meta.target — check message
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
