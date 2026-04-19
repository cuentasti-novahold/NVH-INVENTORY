import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import path from 'path';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/components/dashboard/DashboardSidebar', () => ({
  DashboardSidebar: ({ user }: { user: { name: string | null } }) => (
    <div data-testid="dashboard-sidebar">{user.name ?? 'sidebar'}</div>
  ),
}));

vi.mock('sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

import { auth } from '@/auth';
import DashboardLayout from '../layout';

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Carlos',
    email: 'carlos@novahold.com',
    image: null,
    role: 'ADMIN',
  },
  expires: '2099-01-01',
};

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(auth).mockClear();
    // Make redirect throw so execution stops after it (mirrors Next.js behavior)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to /login when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('renders sidebar and main content when session exists', async () => {
    vi.mocked(redirect).mockImplementation(() => { throw new Error('NEXT_REDIRECT'); });
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    const el = await DashboardLayout({ children: <div data-testid="children" /> });
    render(el);
    expect(screen.getByTestId('dashboard-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('children')).toBeInTheDocument();
  });

  it('renders Toaster when session exists', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    const el = await DashboardLayout({ children: <div /> });
    render(el);
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });

  it('does not have "use client" directive (Server Component)', async () => {
    const { readFileSync } = await import('fs');
    const layoutPath = path.resolve(
      __dirname,
      '../layout.tsx',
    );
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).not.toMatch(/"use client"/);
  });
});
