// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/prisma — $transaction runs callback with mock tx
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn(),
  AuditActions: { ROLE_CHANGED: 'ROLE_CHANGED' },
  getRequestMeta: vi.fn().mockResolvedValue({ ip: '2.2.2.2', userAgent: 'ua2' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { writeAudit, getRequestMeta } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { updateUserRole } from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;
const mockGetRequestMeta = getRequestMeta as ReturnType<typeof vi.fn>;

const superAdminSession = { user: { id: 'admin-1', role: 'SUPER_ADMIN' } };

// Build a mock tx that writeAudit will be called with
const mockTx = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction runs callback with mockTx
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
  );
  mockGetRequestMeta.mockResolvedValue({ ip: '2.2.2.2', userAgent: 'ua2' });
});

// ─── S-08: success path ───────────────────────────────────────────────────

describe('updateUserRole — S-08: success path', () => {
  it('returns ok(undefined) and calls writeAudit with ROLE_CHANGED', async () => {
    mockAuth.mockResolvedValue(superAdminSession);
    mockTx.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'VIEWER' });
    mockTx.user.update.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    mockWriteAudit.mockResolvedValue(undefined);

    const result = await updateUserRole('user-1', 'ADMIN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeUndefined();

    expect(mockWriteAudit).toHaveBeenCalledOnce();
    const auditCall = mockWriteAudit.mock.calls[0];
    // first arg is tx, second is params
    const params = auditCall[1];
    expect(params.action).toBe('ROLE_CHANGED');
    expect(params.entity).toBe('User');
    expect(params.entityId).toBe('user-1');
    expect(params.before).toEqual({ role: 'VIEWER' });
    expect(params.after).toEqual({ role: 'ADMIN' });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/users');
  });
});

// ─── S-09: error paths ────────────────────────────────────────────────────

describe('updateUserRole — S-09a: DB throws', () => {
  it('returns err(UNKNOWN) when $transaction callback throws', async () => {
    mockAuth.mockResolvedValue(superAdminSession);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async () => { throw new Error('connection refused'); },
    );

    const result = await updateUserRole('user-1', 'ADMIN');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBeTruthy();
  });
});

describe('updateUserRole — S-09b: user not found', () => {
  it('returns err(NOT_FOUND) when user does not exist', async () => {
    mockAuth.mockResolvedValue(superAdminSession);
    mockTx.user.findUnique.mockResolvedValue(null);

    const result = await updateUserRole('user-999', 'ADMIN');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
  });
});

describe('updateUserRole — S-09c: same role no-op', () => {
  it('returns ok(undefined) without calling writeAudit when role unchanged', async () => {
    mockAuth.mockResolvedValue(superAdminSession);
    mockTx.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'MANAGER' });

    const result = await updateUserRole('user-1', 'MANAGER');

    expect(result.ok).toBe(true);
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });
});
