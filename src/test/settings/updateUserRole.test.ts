// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
  AuditActions: { ROLE_CHANGED: 'ROLE_CHANGED' },
  getRequestMeta: vi.fn().mockResolvedValue({ ip: null, userAgent: null }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { updateUserRole } from '@/app/(dashboard)/settings/users/actions';

const mockTx = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  auditLog: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
  );
});

describe('updateUserRole', () => {
  it('returns FORBIDDEN when caller is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const r = await updateUserRole('u1', 'ADMIN');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('FORBIDDEN');
  });

  it('returns FORBIDDEN when caller role is not SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'ADMIN' } } as never);
    const r = await updateUserRole('u1', 'VIEWER');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when target user not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'sa', role: 'SUPER_ADMIN' } } as never);
    mockTx.user.findUnique.mockResolvedValue(null);
    const r = await updateUserRole('u999', 'ADMIN');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NOT_FOUND');
  });

  it('is a no-op when newRole equals current role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'sa', role: 'SUPER_ADMIN' } } as never);
    mockTx.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    const r = await updateUserRole('u1', 'ADMIN');
    expect(r.ok).toBe(true);
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when demoting the only SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'sa', role: 'SUPER_ADMIN' } } as never);
    mockTx.user.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN' });
    mockTx.user.count.mockResolvedValue(1);
    const r = await updateUserRole('u1', 'ADMIN');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('FORBIDDEN');
    expect(r.message).toContain('último SUPER_ADMIN');
  });

  it('allows demotion when 2+ SUPER_ADMINs exist', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'sa', role: 'SUPER_ADMIN' } } as never);
    mockTx.user.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN' });
    mockTx.user.count.mockResolvedValue(2);
    mockTx.user.update.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    const r = await updateUserRole('u1', 'ADMIN');
    expect(r.ok).toBe(true);
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'ADMIN' },
    });
  });

  it('updates role on happy path', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'sa', role: 'SUPER_ADMIN' } } as never);
    mockTx.user.findUnique.mockResolvedValue({ id: 'u2', role: 'VIEWER' });
    mockTx.user.update.mockResolvedValue({ id: 'u2', role: 'TECHNICIAN' });
    const r = await updateUserRole('u2', 'TECHNICIAN');
    expect(r.ok).toBe(true);
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { role: 'TECHNICIAN' },
    });
  });
});
