import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePathname } from 'next/navigation';
import { SidebarNavItem } from '../SidebarNavItem';
import { Home } from 'lucide-react';

describe('SidebarNavItem', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/');
  });

  it('renders the label text', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} />);
    expect(screen.getByText('Activos')).toBeInTheDocument();
  });

  it('renders a link with the correct href', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/assets');
  });

  it('is active (bg-sidebar-accent, aria-current) when matchMode exact and pathname equals href', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} matchMode="exact" />);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('bg-sidebar-accent');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is inactive when matchMode exact and pathname differs', () => {
    vi.mocked(usePathname).mockReturnValue('/employees');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} matchMode="exact" />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('bg-sidebar-accent');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('is active when matchMode startsWith (default) and pathname starts with href', () => {
    vi.mocked(usePathname).mockReturnValue('/assets/abc-123');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} />);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('bg-sidebar-accent');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is inactive when matchMode startsWith and pathname does not start with href', () => {
    vi.mocked(usePathname).mockReturnValue('/employees');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('bg-sidebar-accent');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('uses rounded-md for active items (not border-based active state)', () => {
    vi.mocked(usePathname).mockReturnValue('/assets');
    render(<SidebarNavItem href="/assets" label="Activos" icon={Home} />);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('rounded-md');
  });
});
