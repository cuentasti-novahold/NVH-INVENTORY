import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import path from 'path';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/auth';
import DashboardHomePage from '../page';

describe('DashboardHomePage', () => {
  beforeEach(() => {
    vi.mocked(auth).mockClear();
  });

  it('renders welcome message with user name', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { name: 'Carlos', email: 'carlos@novahold.com' },
      expires: '2099-01-01',
    } as never);
    const el = await DashboardHomePage();
    render(el);
    expect(screen.getByText(/Bienvenido, Carlos/i)).toBeInTheDocument();
  });

  it('renders fallback "Usuario" when name is null', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { name: null, email: 'carlos@novahold.com' },
      expires: '2099-01-01',
    } as never);
    const el = await DashboardHomePage();
    render(el);
    expect(screen.getByText(/Bienvenido, Usuario/i)).toBeInTheDocument();
  });

  it('renders a CTA pointing to a module route', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const el = await DashboardHomePage();
    render(el);
    // At least one link pointing to a module route
    const links = screen.getAllByRole('link');
    const hasModuleLink = links.some((l) =>
      (l.getAttribute('href') ?? '').startsWith('/'),
    );
    expect(hasModuleLink).toBe(true);
  });

  it('does not have "use client" directive (Server Component)', async () => {
    const { readFileSync } = await import('fs');
    const pagePath = path.resolve(__dirname, '../page.tsx');
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).not.toMatch(/"use client"/);
  });
});
