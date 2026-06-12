import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '../DashboardSidebar';
import { SidebarProvider } from '../sidebar-context';

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
    render(<SidebarProvider><DashboardSidebar user={mockUser} /></SidebarProvider>);
    expect(screen.getByText('CATÁLOGOS')).toBeInTheDocument();
    expect(screen.getByText('OPERACIONES')).toBeInTheDocument();
    expect(screen.getByText('SISTEMA')).toBeInTheDocument();
  });

  it('renders nav items from SIDEBAR_NAV_SECTIONS config', () => {
    render(<SidebarProvider><DashboardSidebar user={mockUser} /></SidebarProvider>);
    expect(screen.getByText('Activos')).toBeInTheDocument();
    expect(screen.getByText('Empleados')).toBeInTheDocument();
    expect(screen.getByText('Categorías')).toBeInTheDocument();
    // ADMIN has auditLogs:read permission, so Auditoría appears in SISTEMA
    expect(screen.getByText('Auditoría')).toBeInTheDocument();
    // ADMIN does not have users:* permission, so Usuarios is hidden for ADMIN role
  });

  it('renders SidebarUserCard with user name and role', () => {
    render(<SidebarProvider><DashboardSidebar user={mockUser} /></SidebarProvider>);
    expect(screen.getByText('Carlos Velasco')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('marks /assets link as active when pathname is /assets', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<SidebarProvider><DashboardSidebar user={mockUser} /></SidebarProvider>);
    const activeLinks = screen.getAllByRole('link', { current: 'page' });
    expect(activeLinks.length).toBeGreaterThanOrEqual(1);
    expect(activeLinks[0]).toHaveTextContent('Activos');
  });
});
