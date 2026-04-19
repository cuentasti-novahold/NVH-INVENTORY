import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import path from 'path';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock(
  '../presentation/components/UsersTablePage',
  () => ({
    UsersTablePage: ({ users }: { users: unknown[] }) => (
      <div data-testid="users-table" data-count={users.length} />
    ),
  }),
);

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import UsersPage from '../page';

const superAdminSession = {
  user: { id: 'u1', name: 'Admin', email: 'admin@novahold.com', role: 'SUPER_ADMIN' },
  expires: '2099-01-01',
};

const viewerSession = {
  user: { id: 'u2', name: 'Viewer', email: 'viewer@novahold.com', role: 'VIEWER' },
  expires: '2099-01-01',
};

describe('UsersPage', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(auth).mockClear();
    vi.mocked(prisma.user.findMany).mockClear();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to / when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(UsersPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when role is VIEWER (not SUPER_ADMIN)', async () => {
    vi.mocked(auth).mockResolvedValue(viewerSession as never);
    await expect(UsersPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('calls prisma.user.findMany with correct select when SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    await UsersPage();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        }),
      }),
    );
  });

  it('renders UsersTablePage with the fetched users', async () => {
    const mockUsers = [
      { id: 'u1', name: 'Ana', email: 'ana@novahold.com', role: 'ADMIN', createdAt: new Date() },
    ];
    vi.mocked(auth).mockResolvedValue(superAdminSession as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as never);
    const el = await UsersPage();
    const { getByTestId } = render(el);
    expect(getByTestId('users-table')).toBeInTheDocument();
    expect(getByTestId('users-table')).toHaveAttribute('data-count', '1');
  });
});
