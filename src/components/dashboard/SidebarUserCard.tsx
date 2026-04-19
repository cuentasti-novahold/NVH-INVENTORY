'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { UserRole } from '@/generated/prisma';

interface SidebarUserCardProps {
  name: string | null;
  email: string;
  image: string | null;
  role: UserRole;
  collapsed?: boolean;
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  TECHNICIAN: 'Técnico',
  VIEWER: 'Visualizador',
};

export function SidebarUserCard({
  name,
  email,
  image: _image,
  role,
  collapsed = false,
}: SidebarUserCardProps) {
  const displayName = name ?? email;
  const initial = (displayName[0] ?? '?').toUpperCase();

  if (collapsed) {
    return (
      <div className="group/user relative flex justify-center">
        <div className="relative flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-lg bg-sidebar-primary/25 text-xs font-bold text-sidebar-primary">
          {initial}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-sidebar bg-accent"
            aria-hidden
          />
        </div>
        {/* Tooltip */}
        <div
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 hidden group-hover/user:block rounded-md border border-sidebar-border bg-sidebar px-2.5 py-2 shadow-lg"
          role="tooltip"
        >
          <p className="text-xs font-medium text-sidebar-foreground whitespace-nowrap">
            {displayName}
          </p>
          <p className="text-[11px] text-sidebar-foreground/50 whitespace-nowrap">
            {ROLE_LABELS[role]}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/25 text-xs font-bold text-sidebar-primary">
        {initial}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-sidebar bg-accent"
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-sidebar-foreground">
          {displayName}
        </p>
        <p className="truncate text-[11px] leading-tight text-sidebar-foreground/50">
          {ROLE_LABELS[role]}
        </p>
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label="Cerrar sesión"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
