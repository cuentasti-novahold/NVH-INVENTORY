import type { Prisma } from '@/generated/prisma/client';
import { movementInclude } from '@/app/(dashboard)/movimientos/presentation/mappers/movement.mapper';

// Mirror locationHasBodegas PrismaOrTx pattern from src/lib/location.ts
type PrismaTx = Prisma.TransactionClient;

export interface CreateMovementInput {
  assetId: string;
  fromLocationId?: string | null;
  fromBodegaId?: string | null;
  toLocationId: string;
  toBodegaId?: string | null;
  movementType: string;
  reason?: string | null;
  notes?: string | null;
  movedById: string;
}

/**
 * Encapsulates movement + asset-update persistence within an existing transaction.
 * Caller owns the $transaction boundary — do NOT open a new transaction here.
 * Does NOT call auth() or writeAudit; those belong to the caller.
 */
export async function createMovementInTx(tx: PrismaTx, input: CreateMovementInput) {
  const movement = await tx.assetMovement.create({
    data: {
      assetId: input.assetId,
      fromLocationId: input.fromLocationId ?? null,
      fromBodegaId: input.fromBodegaId ?? null,
      toLocationId: input.toLocationId,
      toBodegaId: input.toBodegaId ?? null,
      movementType: input.movementType as never,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      movedById: input.movedById,
    },
    include: movementInclude,
  });

  await tx.asset.update({
    where: { id: input.assetId },
    data: {
      locationId: input.toLocationId,
      bodegaId: input.toBodegaId ?? null,
    },
  });

  return movement;
}
