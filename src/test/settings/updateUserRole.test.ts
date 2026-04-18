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
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { updateUserRole } from '@/app/(dashboard)/settings/users/actions';

describe('updateUserRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when caller is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(updateUserRole('u1', 'ADMIN')).rejects.toThrow('No autorizado');
  });

  it('throws when caller role is not SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'ADMIN' } } as never);
    await expect(updateUserRole('u1', 'VIEWER')).rejects.toThrow('No autorizado');
  });

  it('throws when target user not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'SUPER_ADMIN' } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(updateUserRole('u999', 'ADMIN')).rejects.toThrow('Usuario no encontrado');
  });

  it('is a no-op when newRole equals current role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'SUPER_ADMIN' } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', role: 'ADMIN' } as never);
    await updateUserRole('u1', 'ADMIN');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws when demoting the only SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'SUPER_ADMIN' } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN' } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
    await expect(updateUserRole('u1', 'ADMIN')).rejects.toThrow('último SUPER_ADMIN');
  });

  it('allows demotion when 2+ SUPER_ADMINs exist', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'SUPER_ADMIN' } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN' } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(2 as never);
    await updateUserRole('u1', 'ADMIN');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'ADMIN' },
    });
  });

  it('updates role on happy path', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'SUPER_ADMIN' } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u2', role: 'VIEWER' } as never);
    await updateUserRole('u2', 'TECHNICIAN');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { role: 'TECHNICIAN' },
    });
  });
});
