import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SidebarUserCard } from '../SidebarUserCard';

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

// Import signOut AFTER the mock
import { signOut } from 'next-auth/react';

describe('SidebarUserCard', () => {
  beforeEach(() => {
    vi.mocked(signOut).mockClear();
  });

  it('displays the user name when provided', () => {
    render(
      <SidebarUserCard
        name="Carlos Velasco"
        email="carlos@novahold.com"
        image={null}
        role="ADMIN"
      />,
    );
    expect(screen.getByText('Carlos Velasco')).toBeInTheDocument();
  });

  it('falls back to email when name is null', () => {
    render(
      <SidebarUserCard
        name={null}
        email="carlos@novahold.com"
        image={null}
        role="VIEWER"
      />,
    );
    expect(screen.getByText('carlos@novahold.com')).toBeInTheDocument();
  });

  it('shows the human-readable role label', () => {
    render(
      <SidebarUserCard
        name="Ana"
        email="ana@novahold.com"
        image={null}
        role="SUPER_ADMIN"
      />,
    );
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
  });

  it('renders the initial letter of the display name', () => {
    render(
      <SidebarUserCard
        name="Carlos"
        email="carlos@novahold.com"
        image={null}
        role="ADMIN"
      />,
    );
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('calls signOut with callbackUrl /login when logout button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SidebarUserCard
        name="Carlos"
        email="carlos@novahold.com"
        image={null}
        role="ADMIN"
      />,
    );
    const logoutBtn = screen.getByRole('button', { name: /cerrar sesión/i });
    await user.click(logoutBtn);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });
});
