import type { MovementRow } from '../dto/movement.dto';

export const movementInclude = {
  asset: { select: { assetCode: true, brand: true, model: true } },
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
  fromBodega: { select: { name: true } },
  toBodega: { select: { name: true } },
  movedBy: { select: { name: true } },
} as const;

type DbMovement = {
  id: string;
  assetId: string;
  fromLocationId: string | null;
  fromBodegaId: string | null;
  toLocationId: string;
  toBodegaId: string | null;
  movementType: string;
  reason: string | null;
  notes: string | null;
  movedById: string;
  movedAt: Date;
  createdAt: Date;
  asset: { assetCode: string; brand: string | null; model: string | null };
  fromLocation: { name: string } | null;
  toLocation: { name: string };
  fromBodega: { name: string } | null;
  toBodega: { name: string } | null;
  movedBy: { name: string | null };
};

export function toMovementRow(m: DbMovement): MovementRow {
  const { brand, model, assetCode } = m.asset;
  const assetLabel = brand && model ? `${brand} ${model}` : assetCode;

  return {
    id: m.id,
    assetId: m.assetId,
    assetCode,
    assetLabel,
    fromLocationId: m.fromLocationId,
    fromLocationName: m.fromLocation?.name ?? null,
    fromBodegaId: m.fromBodegaId,
    fromBodegaName: m.fromBodega?.name ?? null,
    toLocationId: m.toLocationId,
    toLocationName: m.toLocation.name,
    toBodegaId: m.toBodegaId,
    toBodegaName: m.toBodega?.name ?? null,
    movementType: m.movementType as MovementRow['movementType'],
    reason: m.reason,
    notes: m.notes,
    movedById: m.movedById,
    movedByName: m.movedBy.name,
    movedAt: m.movedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}
