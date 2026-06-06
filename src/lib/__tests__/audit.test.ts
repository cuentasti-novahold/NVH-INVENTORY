import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRequestMeta, buildAuditEntry, writeAudit, AuditActions } from '../audit';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';

const mockHeaders = (map: Record<string, string>) =>
  (headers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (k: string) => map[k.toLowerCase()] ?? null,
  });

// ─── S-01 / S-02 — getRequestMeta ────────────────────────────────────────────

describe('getRequestMeta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('S-01: extracts first IP from comma-separated x-forwarded-for', async () => {
    mockHeaders({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'user-agent': 'Mozilla/5.0' });
    expect(await getRequestMeta()).toEqual({ ip: '203.0.113.5', userAgent: 'Mozilla/5.0' });
  });

  it('S-01: falls back to x-real-ip when x-forwarded-for absent', async () => {
    mockHeaders({ 'x-real-ip': '198.51.100.7' });
    expect(await getRequestMeta()).toEqual({ ip: '198.51.100.7', userAgent: null });
  });

  it('S-02: returns { ip: null, userAgent: null } when headers are empty', async () => {
    mockHeaders({});
    expect(await getRequestMeta()).toEqual({ ip: null, userAgent: null });
  });

  it('S-02: returns { ip: null, userAgent: null } when headers() throws (non-request context)', async () => {
    (headers as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no ctx'));
    expect(await getRequestMeta()).toEqual({ ip: null, userAgent: null });
  });
});

// ─── S-03 — buildAuditEntry ───────────────────────────────────────────────────

describe('buildAuditEntry', () => {
  it('S-03A: sets assetId when entity is Asset and assetId present', () => {
    const entry = buildAuditEntry({
      entity: 'Asset',
      entityId: 'a1',
      assetId: 'a1',
      action: AuditActions.CREATE,
      userId: 'u1',
    });
    expect(entry.assetId).toBe('a1');
  });

  it('S-03B: omits assetId key entirely when entity is not Asset', () => {
    const entry = buildAuditEntry({
      entity: 'Employee',
      entityId: 'e1',
      action: AuditActions.CREATE,
      userId: 'u1',
    });
    expect('assetId' in entry).toBe(false);
  });

  it('S-03C: omits assetId when entity is Asset but assetId is null', () => {
    const entry = buildAuditEntry({
      entity: 'Asset',
      entityId: 'a1',
      assetId: null,
      action: AuditActions.UPDATE,
      userId: 'u1',
    });
    expect('assetId' in entry).toBe(false);
  });
});

// ─── S-04 — writeAudit ───────────────────────────────────────────────────────

describe('writeAudit', () => {
  it('S-04: calls tx.auditLog.create exactly once with correct payload', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as never;

    await writeAudit(tx, {
      userId: 'u1',
      action: AuditActions.CREATE,
      entity: 'Asset',
      entityId: 'a1',
      assetId: 'a1',
      ip: '1.2.3.4',
      userAgent: 'agent',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      action: 'CREATE',
      entity: 'Asset',
      entityId: 'a1',
      assetId: 'a1',
      ip: '1.2.3.4',
      userAgent: 'agent',
    });
  });

  it('S-04: propagates error thrown by tx.auditLog.create', async () => {
    const tx = {
      auditLog: { create: vi.fn().mockRejectedValue(new Error('DB_WRITE_FAIL')) },
    } as never;

    await expect(
      writeAudit(tx, {
        userId: 'u1',
        action: AuditActions.CREATE,
        entity: 'Asset',
        entityId: 'a1',
      }),
    ).rejects.toThrow('DB_WRITE_FAIL');
  });
});
