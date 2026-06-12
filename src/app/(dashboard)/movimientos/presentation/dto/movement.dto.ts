export type MovementType = 'RELOCATION' | 'LOAN' | 'REPAIR' | 'RETURN_FROM_REPAIR' | 'AUDIT' | 'ASSIGNMENT_DELIVERY' | 'ASSIGNMENT_RETURN';

export interface MovementRow {
  id: string;
  assetId: string;
  assetCode: string;
  assetLabel: string;
  fromLocationId: string | null;
  fromLocationName: string | null;
  fromBodegaId: string | null;
  fromBodegaName: string | null;
  toLocationId: string;
  toLocationName: string;
  toBodegaId: string | null;
  toBodegaName: string | null;
  movementType: MovementType;
  reason: string | null;
  notes: string | null;
  movedById: string;
  movedByName: string | null;
  movedAt: string;
  createdAt: string;
}

export interface CreateMovementDTO {
  assetId: string;
  fromLocationId?: string | null;
  fromBodegaId?: string | null;
  toLocationId: string;
  toBodegaId?: string | null;
  movementType: MovementType;
  reason?: string | null;
  notes?: string | null;
}
