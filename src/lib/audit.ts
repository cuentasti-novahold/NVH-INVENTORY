import 'server-only';
import { headers } from 'next/headers';
import { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';

// REQ-01 — single source of truth for audit action strings
export const AuditActions = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DEACTIVATE: 'DEACTIVATE',
  DELETE: 'DELETE',
  ROLE_CHANGED: 'ROLE_CHANGED',
  RETURNED: 'RETURNED',
  TRANSFERRED: 'TRANSFERRED',
  MOVED: 'MOVED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

// tx client type extracted from $transaction interactive callback — no `any` (NFR-06)
export type PrismaTransaction = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

export interface AuditEntryParams {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  assetId?: string | null;
}

// REQ-02a — resolved ONCE per action, OUTSIDE $transaction (NFR-03). Never throws.
export async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    const ip =
      (xff ? xff.split(',')[0]?.trim() : undefined) ?? h.get('x-real-ip') ?? null;
    const userAgent = h.get('user-agent') ?? null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

// REQ-02b — pure, no side effects, never throws. assetId ONLY for entity==='Asset'.
export function buildAuditEntry(params: AuditEntryParams): Prisma.AuditLogUncheckedCreateInput {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    userId: params.userId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    before: (params.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    after: (params.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  };
  if (params.entity === 'Asset' && params.assetId != null) {
    data.assetId = params.assetId;
  }
  return data;
}

// REQ-02c — ONLY place that calls tx.auditLog.create. Throws → outer $transaction rolls back.
export async function writeAudit(tx: PrismaTransaction, params: AuditEntryParams): Promise<void> {
  await tx.auditLog.create({ data: buildAuditEntry(params) });
}
