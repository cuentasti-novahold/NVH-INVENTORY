import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '../DashboardSidebar';

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

const mockUser = {
  id: 'user-1',
  name: 'Carlos Velasco',
  email: 'carlos@novahold.com',
  image: null,
  role: 'ADMIN' as const,
};

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/assets');
  });

  it('renders all 3 section headings', () => {
    render(<DashboardSidebar user={mockUser} />);
    expect(screen.getByText('CATÁLOGOS')).toBeInTheDocument();
    expect(screen.getByText('OPERACIONES')).toBeInTheDocument();
    expect(screen.getByText('SISTEMA')).toBeInTheDocument();
  });

  it('renders nav items from SIDEBAR_NAV_SECTIONS config', () => {
    render(<DashboardSidebar user={mockUser} />);
    expect(screen.getByText('Activos')).toBeInTheDocument();
    expect(screen.getByText('Empleados')).toBeInTheDocument();
    expect(screen.getByText('Categorías')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });

  it('renders SidebarUserCard with user name and role', () => {
    render(<DashboardSidebar user={mockUser} />);
    expect(screen.getByText('Carlos Velasco')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('marks /assets link as active when pathname is /assets', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<DashboardSidebar user={mockUser} />);
    const activeLinks = screen.getAllByRole('link', { current: 'page' });
    expect(activeLinks.length).toBeGreaterThanOrEqual(1);
    expect(activeLinks[0]).toHaveTextContent('Activos');
  });
});
