'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/generated/prisma';
import { ok, err } from '@/shared/types/action-result';
import type { ActionResult } from '@/shared/types/action-result';
import type { PageInfo } from '@/shared/types/pagination';
import { writeAudit, AuditActions, getRequestMeta } from '@/lib/audit';

// ─── List ──────────────────────────────────────────────────────────────────

export interface ListUsersParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
}

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  image: string | null;
  createdAt: string;
}

export interface ListUsersResult {
  rows: UserRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listUsersAction(
  params: ListUsersParams = {},
): Promise<ActionResult<ListUsersResult>> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN')
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.user.findUnique({
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
    const pivot = await prisma.user.findUnique({
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

  const hasCursor = Object.keys(cursorWhere).length > 0;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.user.findMany({
      where: hasCursor ? cursorWhere : undefined,
      orderBy,
      take: limit + 1,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  const mappedRows: UserRow[] = data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    image: u.image ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

  return ok({ rows: mappedRows, rowCount, pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit } });
}

export async function updateUserRole(userId: string, newRole: UserRole): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN')
    return err('FORBIDDEN', 'Sin permiso');

  const { ip, userAgent } = await getRequestMeta();

  try {
    const changed = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!target) return { notFound: true as const };
      if (target.role === newRole) return { noop: true as const };

      if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
        const superAdminCount = await tx.user.count({
          where: { role: 'SUPER_ADMIN' },
        });
        if (superAdminCount <= 1) {
          throw { guard: 'LAST_SUPER_ADMIN' };
        }
      }

      await tx.user.update({ where: { id: userId }, data: { role: newRole } });
      await writeAudit(tx, {
        userId: session.user.id as string,
        action: AuditActions.ROLE_CHANGED,
        entity: 'User',
        entityId: userId,
        before: { role: target.role },
        after: { role: newRole },
        ip,
        userAgent,
      });
      return { ok: true as const };
    });

    if ('notFound' in changed) return err('NOT_FOUND', 'Usuario no encontrado');
    revalidatePath('/settings/users');
    return ok(undefined);
  } catch (e) {
    if ((e as { guard?: string }).guard === 'LAST_SUPER_ADMIN')
      return err('FORBIDDEN', 'No puede degradar al último SUPER_ADMIN');
    return err('UNKNOWN', 'Error al actualizar rol');
  }
}
