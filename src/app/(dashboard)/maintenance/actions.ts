'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { writeAudit, AuditActions, getRequestMeta } from '@/lib/audit';
import { createMaintenanceSchema, updateMaintenanceSchema } from './presentation/schemas/maintenance.schema';
import { toMaintenanceRow, maintenanceInclude } from './presentation/mappers/maintenance.mapper';
import type { MaintenanceRow, CreateMaintenanceDTO, UpdateMaintenanceDTO, MaintenanceStats, PendingMaintenanceRow } from './presentation/dto/maintenance.dto';
import type { PageInfo } from '@/shared/types/pagination';

type Role = Parameters<typeof hasPermission>[0];

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

// ─── List ──────────────────────────────────────────────────────────────────

export interface ListMaintenancesParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  type?: string;
  assetId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListMaintenancesResult {
  rows: MaintenanceRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listMaintenancesAction(
  params: ListMaintenancesParams = {},
): Promise<ActionResult<ListMaintenancesResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'maintenance', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;

  const filterWhere: Record<string, unknown> = {};
  if (params.type && params.type !== 'all') filterWhere.type = params.type;
  if (params.assetId) filterWhere.assetId = params.assetId;
  if (params.dateFrom || params.dateTo) {
    filterWhere.performedAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
    };
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { performedAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { performedAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.maintenance.findUnique({
      where: { id: afterCursor },
      select: { performedAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { performedAt: { lt: pivot.performedAt } },
          { performedAt: pivot.performedAt, id: { lt: afterCursor } },
        ],
      };
    }
  } else if (beforeCursor) {
    const pivot = await prisma.maintenance.findUnique({
      where: { id: beforeCursor },
      select: { performedAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { performedAt: { gt: pivot.performedAt } },
          { performedAt: pivot.performedAt, id: { gt: beforeCursor } },
        ],
      };
      orderBy = [{ performedAt: 'asc' }, { id: 'asc' }];
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
    prisma.maintenance.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: maintenanceInclude,
    }),
    prisma.maintenance.count({ where: filterWhere }),
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
    rows: (data as any[]).map(toMaintenanceRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createMaintenanceAction(
  input: CreateMaintenanceDTO,
): Promise<ActionResult<MaintenanceRow>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  if (!hasPermission(session.user.role as Role, 'maintenance', 'create'))
    return err('FORBIDDEN', 'Sin permiso');

  let dto: CreateMaintenanceDTO;
  try {
    dto = (await createMaintenanceSchema.validate(input, { abortEarly: false })) as CreateMaintenanceDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const { ip, userAgent } = await getRequestMeta();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const maintenance = await tx.maintenance.create({
        data: {
          assetId: dto.assetId,
          type: dto.type as never,
          description: dto.description ?? null,
          performedBy: dto.performedBy ?? null,
          performedAt: new Date(dto.performedAt),
          nextReview: dto.nextReview ? new Date(dto.nextReview) : null,
        },
        include: maintenanceInclude,
      });

      if (dto.type === 'REVISION') {
        await tx.asset.update({
          where: { id: dto.assetId },
          data: { lastRevision: new Date(dto.performedAt) },
        });
      }

      await writeAudit(tx, {
        userId: session.user.id as string,
        action: AuditActions.CREATE,
        entity: 'Maintenance',
        entityId: maintenance.id,
        before: null,
        after: {
          assetId: maintenance.assetId,
          type: maintenance.type,
          performedAt: maintenance.performedAt,
          performedBy: maintenance.performedBy ?? null,
        },
        ip,
        userAgent,
      });

      return maintenance;
    });

    revalidatePath('/maintenance');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toMaintenanceRow(created as any));
  } catch {
    return err('UNKNOWN', 'Error al registrar mantenimiento');
  }
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateMaintenanceAction(
  id: string,
  input: UpdateMaintenanceDTO,
): Promise<ActionResult<MaintenanceRow>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  if (!hasPermission(session.user.role as Role, 'maintenance', 'update'))
    return err('FORBIDDEN', 'Sin permiso');

  let dto: UpdateMaintenanceDTO;
  try {
    dto = (await updateMaintenanceSchema.validate(input, { abortEarly: false })) as UpdateMaintenanceDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const { ip, userAgent } = await getRequestMeta();

  // Pre-fetch snapshot BEFORE transaction
  const snapshot = await prisma.maintenance.findUnique({
    where: { id },
    select: { type: true, description: true, performedBy: true, performedAt: true, nextReview: true },
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const maintenance = await tx.maintenance.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type as never } : {}),
          ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
          ...(dto.performedBy !== undefined ? { performedBy: dto.performedBy ?? null } : {}),
          ...(dto.performedAt !== undefined ? { performedAt: new Date(dto.performedAt) } : {}),
          ...(dto.nextReview !== undefined ? { nextReview: dto.nextReview ? new Date(dto.nextReview) : null } : {}),
        },
        include: maintenanceInclude,
      });

      if (dto.type === 'REVISION' && dto.performedAt) {
        await tx.asset.update({
          where: { id: maintenance.assetId },
          data: { lastRevision: new Date(dto.performedAt) },
        });
      }

      await writeAudit(tx, {
        userId: session.user.id as string,
        action: AuditActions.UPDATE,
        entity: 'Maintenance',
        entityId: id,
        before: snapshot,
        after: {
          type: maintenance.type,
          description: maintenance.description ?? null,
          performedBy: maintenance.performedBy ?? null,
          performedAt: maintenance.performedAt,
          nextReview: maintenance.nextReview ?? null,
        },
        ip,
        userAgent,
      });

      return maintenance;
    });

    revalidatePath('/maintenance');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toMaintenanceRow(updated as any));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Mantenimiento no encontrado');
    return err('UNKNOWN', 'Error al actualizar mantenimiento');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteMaintenanceAction(id: string): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  if (!hasPermission(session.user.role as Role, 'maintenance', 'delete'))
    return err('FORBIDDEN', 'Sin permiso');

  // Pre-fetch snapshot BEFORE transaction
  const snapshot = await prisma.maintenance.findUnique({
    where: { id },
    select: { assetId: true, type: true, performedAt: true },
  });

  const { ip, userAgent } = await getRequestMeta();

  try {
    await prisma.$transaction(async (tx) => {
      // writeAudit BEFORE delete (audit snapshot must be captured first)
      await writeAudit(tx, {
        userId: session.user!.id as string,
        action: AuditActions.DELETE,
        entity: 'Maintenance',
        entityId: id,
        before: snapshot,
        after: null,
        ip,
        userAgent,
      });

      await tx.maintenance.delete({ where: { id } });
    });
    revalidatePath('/maintenance');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Mantenimiento no encontrado');
    return err('UNKNOWN', 'Error al eliminar mantenimiento');
  }
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export async function getMaintenanceStatsAction(): Promise<ActionResult<MaintenanceStats>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'maintenance', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);

  const [totalRecords, overdueItems, upcomingItems, allActiveAssets] = await Promise.all([
    prisma.maintenance.count(),
    // Assets where latest maintenance has nextReview < today
    prisma.maintenance.groupBy({
      by: ['assetId'],
      where: { nextReview: { lt: now } },
      _max: { nextReview: true },
    }),
    // Assets where latest maintenance has nextReview in [today, today+7]
    prisma.maintenance.groupBy({
      by: ['assetId'],
      where: { nextReview: { gte: now, lte: sevenDaysFromNow } },
      _max: { nextReview: true },
    }),
    prisma.asset.count({ where: { isActive: true } }),
  ]);

  const overdueAssetIds = new Set(overdueItems.map((r) => r.assetId));
  const upcomingAssetIds = new Set(upcomingItems.map((r) => r.assetId));
  // Remove from overdue those that also appear in upcoming (upcoming takes priority)
  upcomingAssetIds.forEach((id) => overdueAssetIds.delete(id));

  const overdue = overdueAssetIds.size;
  const upcoming = upcomingAssetIds.size;
  const upToDate = Math.max(0, allActiveAssets - overdue - upcoming);

  return ok({ totalRecords, upToDate, upcoming, overdue });
}

// ─── Pending ───────────────────────────────────────────────────────────────

export async function getPendingMaintenanceAction(): Promise<ActionResult<PendingMaintenanceRow[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'maintenance', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);

  // Get maintenances with nextReview set (past or upcoming 7 days), latest per asset
  const records = await prisma.maintenance.findMany({
    where: {
      nextReview: { lte: sevenDaysFromNow },
      asset: { isActive: true },
    },
    orderBy: { nextReview: 'asc' },
    include: {
      asset: { select: { assetCode: true, brand: true, model: true, lastRevision: true } },
    },
  });

  // Deduplicate: keep only the most relevant record per asset
  const seen = new Map<string, (typeof records)[0]>();
  for (const r of records) {
    const existing = seen.get(r.assetId);
    if (!existing || (r.nextReview && existing.nextReview && r.nextReview < existing.nextReview)) {
      seen.set(r.assetId, r);
    }
  }

  const rows: PendingMaintenanceRow[] = Array.from(seen.values()).map((r) => {
    const daysUntil = r.nextReview
      ? Math.round((r.nextReview.getTime() - now.getTime()) / 86_400_000)
      : null;
    const status: PendingMaintenanceRow['status'] =
      daysUntil === null ? 'no-record' : daysUntil < 0 ? 'overdue' : 'upcoming';
    const assetLabel = [r.asset.brand, r.asset.model].filter(Boolean).join(' ') || r.asset.assetCode;
    return {
      assetId: r.assetId,
      assetCode: r.asset.assetCode,
      assetLabel,
      lastRevision: r.asset.lastRevision?.toISOString() ?? null,
      nextReview: r.nextReview?.toISOString() ?? null,
      daysUntil,
      status,
    };
  });

  // Sort: overdue first (most negative daysUntil), then upcoming by closest
  rows.sort((a, b) => {
    if (a.daysUntil === null) return 1;
    if (b.daysUntil === null) return -1;
    return a.daysUntil - b.daysUntil;
  });

  return ok(rows.slice(0, 10));
}
