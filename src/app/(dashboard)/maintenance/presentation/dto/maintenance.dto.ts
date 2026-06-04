export type MaintenanceType = 'REVISION' | 'REPAIR' | 'UPGRADE' | 'CLEANING';

export interface MaintenanceRow {
  id: string;
  assetId: string;
  assetCode: string;
  assetLabel: string;
  type: MaintenanceType;
  description: string | null;
  performedBy: string | null;
  performedAt: string;
  nextReview: string | null;
  createdAt: string;
}

export interface CreateMaintenanceDTO {
  assetId: string;
  type: MaintenanceType;
  description?: string | null;
  performedBy?: string | null;
  performedAt: string;
  nextReview?: string | null;
}

export type UpdateMaintenanceDTO = Partial<Omit<CreateMaintenanceDTO, 'assetId'>>;

export interface MaintenanceStats {
  totalRecords: number;
  upToDate: number;
  upcoming: number;
  overdue: number;
}

export interface PendingMaintenanceRow {
  assetId: string;
  assetCode: string;
  assetLabel: string;
  lastRevision: string | null;
  nextReview: string | null;
  daysUntil: number | null;
  status: 'overdue' | 'upcoming' | 'no-record';
}
