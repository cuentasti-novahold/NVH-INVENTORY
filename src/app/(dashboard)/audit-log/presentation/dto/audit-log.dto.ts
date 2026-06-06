export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userName: string | null;
  userEmail: string | null;
  assetCode: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string; // ISO string
}
