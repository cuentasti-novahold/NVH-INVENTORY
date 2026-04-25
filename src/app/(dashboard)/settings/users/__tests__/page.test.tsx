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
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
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

const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockUser = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };

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
    mockUser.findUnique.mockReset();
    mockUser.findMany.mockReset();
    mockUser.count.mockReset();
    mockTransaction.mockReset();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to / when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(UsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when role is VIEWER (not SUPER_ADMIN)', async () => {
    vi.mocked(auth).mockResolvedValue(viewerSession as never);
    await expect(UsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('calls prisma.user.findMany with correct select when SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as never);
    mockUser.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([[], 0]);
    await UsersPage({ searchParams: Promise.resolve({}) });
    expect(mockTransaction).toHaveBeenCalled();
    const [findManyCall] = mockTransaction.mock.calls[0][0] as unknown[];
    void findManyCall;
  });

  it('renders UsersTablePage with the fetched users', async () => {
    const mockUsers = [
      { id: 'u1', name: 'Ana', email: 'ana@novahold.com', role: 'ADMIN', image: null, createdAt: new Date() },
    ];
    vi.mocked(auth).mockResolvedValue(superAdminSession as never);
    mockUser.findUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([mockUsers, 1]);
    const el = await UsersPage({ searchParams: Promise.resolve({}) });
    const { getByTestId } = render(el);
    expect(getByTestId('users-table')).toBeInTheDocument();
    expect(getByTestId('users-table')).toHaveAttribute('data-count', '1');
  });
});
