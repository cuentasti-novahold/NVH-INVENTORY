'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { createMovementSchema } from './presentation/schemas/movement.schema';
import { toMovementRow, movementInclude } from './presentation/mappers/movement.mapper';
import type { MovementRow, CreateMovementDTO } from './presentation/dto/movement.dto';

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

export interface ListMovementsParams {
  page?: number;
  pageSize?: number;
  movementType?: string;
  assetId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListMovementsResult {
  rows: MovementRow[];
  rowCount: number;
  pageCount: number;
}

export async function listMovementsAction(
  params: ListMovementsParams = {},
): Promise<ActionResult<ListMovementsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'movements', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));

  const where: Record<string, unknown> = {};
  if (params.movementType && params.movementType !== 'all') where.movementType = params.movementType;
  if (params.assetId) where.assetId = params.assetId;
  if (params.locationId) where.toLocationId = params.locationId;
  if (params.dateFrom || params.dateTo) {
    where.movedAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
    };
  }

  const [rows, rowCount] = await prisma.$transaction([
    prisma.assetMovement.findMany({
      where,
      orderBy: { movedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: movementInclude,
    }),
    prisma.assetMovement.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({ rows: (rows as any[]).map(toMovementRow), rowCount, pageCount });
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

  try {
    const created = await prisma.$transaction(async (tx) => {
      const movement = await tx.assetMovement.create({
        data: {
          assetId: dto.assetId,
          fromLocationId: dto.fromLocationId ?? null,
          fromBodegaId: dto.fromBodegaId ?? null,
          toLocationId: dto.toLocationId,
          toBodegaId: dto.toBodegaId ?? null,
          movementType: dto.movementType as never,
          reason: dto.reason ?? null,
          notes: dto.notes ?? null,
          movedById: session.user!.id as string,
        },
        include: movementInclude,
      });

      await tx.asset.update({
        where: { id: dto.assetId },
        data: {
          locationId: dto.toLocationId,
          bodegaId: dto.toBodegaId ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user!.id as string,
          action: 'MOVED',
          entity: 'Asset',
          entityId: dto.assetId,
          before: { locationId: dto.fromLocationId ?? null, bodegaId: dto.fromBodegaId ?? null },
          after: { locationId: dto.toLocationId, bodegaId: dto.toBodegaId ?? null },
        },
      });

      return movement;
    });

    revalidatePath('/movimientos');
    revalidatePath('/assets');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toMovementRow(created as any));
  } catch {
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
