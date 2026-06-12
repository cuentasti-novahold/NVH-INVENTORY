'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { writeAudit, AuditActions, getRequestMeta } from '@/lib/audit';
import { locationHasBodegas } from '@/lib/location';
import { createMovementInTx } from '@/lib/inventory/movement.helpers';
import { createMovementSchema } from './presentation/schemas/movement.schema';
import { toMovementRow, movementInclude } from './presentation/mappers/movement.mapper';
import type { MovementRow, CreateMovementDTO } from './presentation/dto/movement.dto';

type Role = Parameters<typeof hasPermission>[0];

class ValidationAbort extends Error {
  constructor(
    public field: string,
    public msg: string,
  ) {
    super(msg);
    this.name = 'ValidationAbort';
  }
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

// ─── List ──────────────────────────────────────────────────────────────────

import type { PageInfo } from '@/shared/types/pagination';

export interface ListMovementsParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  movementType?: string;
  assetId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListMovementsResult {
  rows: MovementRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listMovementsAction(
  params: ListMovementsParams = {},
): Promise<ActionResult<ListMovementsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'movements', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;

  const filterWhere: Record<string, unknown> = {};
  if (params.movementType && params.movementType !== 'all') filterWhere.movementType = params.movementType;
  if (params.assetId) filterWhere.assetId = params.assetId;
  if (params.locationId) filterWhere.toLocationId = params.locationId;
  if (params.dateFrom || params.dateTo) {
    filterWhere.movedAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
    };
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.assetMovement.findUnique({
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
    const pivot = await prisma.assetMovement.findUnique({
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
    prisma.assetMovement.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: movementInclude,
    }),
    prisma.assetMovement.count({ where: filterWhere }),
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
    rows: (data as any[]).map(toMovementRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createMovementAction(
  input: CreateMovementDTO,
): Promise<ActionResult<MovementRow>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  if (!hasPermission(session.user.role as Role, 'movements', 'create'))
    return err('FORBIDDEN', 'Sin permiso');

  let dto: CreateMovementDTO;
  try {
    dto = (await createMovementSchema.validate(input, { abortEarly: false })) as CreateMovementDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const { ip, userAgent } = await getRequestMeta();

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Conditional bodega guard: if destination has bodegas, toBodegaId is required
      if (!dto.toBodegaId && (await locationHasBodegas(tx, dto.toLocationId))) {
        throw new ValidationAbort(
          'toBodegaId',
          'La bodega de destino es obligatoria para esta sede',
        );
      }

      // REQ-S-09: use shared helper (also updates Asset.locationId + bodegaId atomically)
      const movement = await createMovementInTx(tx, {
        assetId: dto.assetId,
        fromLocationId: dto.fromLocationId ?? null,
        fromBodegaId: dto.fromBodegaId ?? null,
        toLocationId: dto.toLocationId,
        toBodegaId: dto.toBodegaId ?? null,
        movementType: dto.movementType,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        movedById: session.user!.id as string,
      });

      await writeAudit(tx, {
        userId: session.user!.id as string,
        action: AuditActions.MOVED,
        entity: 'Asset',
        entityId: dto.assetId,
        assetId: dto.assetId,
        before: {
          locationId: dto.fromLocationId ?? null,
          locationName: movement.fromLocation?.name ?? null,
          bodegaId: dto.fromBodegaId ?? null,
        },
        after: {
          locationId: dto.toLocationId,
          locationName: movement.toLocation.name,
          bodegaId: dto.toBodegaId ?? null,
        },
        ip,
        userAgent,
      });

      return movement;
    });

    revalidatePath('/movimientos');
    revalidatePath('/assets');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toMovementRow(created as any));
  } catch (e) {
    if (e instanceof ValidationAbort)
      return err('VALIDATION', 'Datos inválidos', { [e.field]: e.msg });
    return err('UNKNOWN', 'Error al registrar traslado');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteMovementAction(id: string): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  if (!hasPermission(session.user.role as Role, 'movements', 'delete'))
    return err('FORBIDDEN', 'Sin permiso');

  try {
    await prisma.assetMovement.delete({ where: { id } });
    revalidatePath('/movimientos');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Movimiento no encontrado');
    return err('UNKNOWN', 'Error al eliminar movimiento');
  }
}
