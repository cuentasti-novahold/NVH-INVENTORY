'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { PageInfo } from '@/shared/types/pagination';
import type { AuditLogRow } from './presentation/dto/audit-log.dto';

type Role = Parameters<typeof hasPermission>[0];

// ─── List ───────────────────────────────────────────────────────────────────

export interface ListAuditLogsParams {
  cursor?: string;
  limit?: number;
  entity?: string;
  action?: string;
  search?: string;
}

export interface ListAuditLogsResult {
  rows: AuditLogRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listAuditLogsAction(
  params: ListAuditLogsParams = {},
): Promise<ActionResult<ListAuditLogsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'auditLogs', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.limit ?? 20));

  const filterWhere: Record<string, unknown> = {};
  if (params.entity && params.entity !== 'all') filterWhere.entity = params.entity;
  if (params.action && params.action !== 'all') filterWhere.action = params.action;
  if (params.search) {
    filterWhere.OR = [
      { userId: { contains: params.search } },
      { entityId: { contains: params.search } },
    ];
  }

  let cursorWhere: Record<string, unknown> = {};

  if (params.cursor) {
    const pivot = await prisma.auditLog.findUnique({
      where: { id: params.cursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { lt: params.cursor } },
        ],
      };
    }
  }

  const hasFilter = Object.keys(filterWhere).length > 0;
  const hasCursor = Object.keys(cursorWhere).length > 0;
  const finalWhere =
    hasFilter && hasCursor
      ? { AND: [cursorWhere, filterWhere] }
      : hasCursor
        ? cursorWhere
        : filterWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where: finalWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        user: { select: { name: true, email: true } },
        asset: { select: { assetCode: true } },
      },
    }),
    prisma.auditLog.count({ where: filterWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;

  const hasNextPage = hasExtraRow;
  const hasPreviousPage = !!params.cursor;
  const startCursor = trimmed.length > 0 ? trimmed[0].id : undefined;
  const endCursor = trimmed.length > 0 ? trimmed[trimmed.length - 1].id : undefined;

  const mapped: AuditLogRow[] = trimmed.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    userName: r.user?.name ?? null,
    userEmail: r.user?.email ?? null,
    assetCode: r.asset?.assetCode ?? null,
    before: r.before,
    after: r.after,
    ip: r.ip ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return ok({
    rows: mapped,
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}
