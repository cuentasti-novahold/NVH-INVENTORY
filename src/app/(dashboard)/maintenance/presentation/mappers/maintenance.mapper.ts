import type { MaintenanceRow, MaintenanceType } from '../dto/maintenance.dto';

export const maintenanceInclude = {
  asset: { select: { assetCode: true, brand: true, model: true } },
} as const;

type DbMaintenance = {
  id: string;
  assetId: string;
  type: string;
  description: string | null;
  performedBy: string | null;
  performedAt: Date;
  nextReview: Date | null;
  createdAt: Date;
  asset: { assetCode: string; brand: string | null; model: string | null };
};

export function toMaintenanceRow(m: DbMaintenance): MaintenanceRow {
  const { brand, model, assetCode } = m.asset;
  const assetLabel =
    [brand, model].filter(Boolean).join(' ') || assetCode;

  return {
    id: m.id,
    assetId: m.assetId,
    assetCode,
    assetLabel,
    type: m.type as MaintenanceType,
    description: m.description,
    performedBy: m.performedBy,
    performedAt: m.performedAt.toISOString(),
    nextReview: m.nextReview ? m.nextReview.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}
