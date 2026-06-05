'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarNavItem } from '@/components/dashboard/SidebarNavItem';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import { SIDEBAR_NAV_SECTIONS } from '@/components/dashboard/sidebar-nav-config';
import { useSidebar } from '@/components/dashboard/sidebar-context';
import type { UserRole } from '@/generated/prisma';

interface DashboardSidebarProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: UserRole;
  };
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const { collapsed, mobileOpen, toggle, closeMobile } = useSidebar();
  const pathname = usePathname();

  // On mobile the drawer is always fully expanded regardless of desktop collapsed state
  const isCollapsed = collapsed && !mobileOpen;

  // Close mobile drawer on navigation
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'flex flex-col bg-sidebar text-sidebar-foreground',
          // Mobile: fixed overlay (out of flow)
          'fixed inset-y-0 left-0 z-50 w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: back to normal flow
          'lg:relative lg:inset-auto lg:z-auto',
          'lg:translate-x-0',
          isCollapsed ? 'lg:w-14' : 'lg:w-60',
          // Smooth width + slide transitions
          'transition-[width,transform] duration-200 ease-out',
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            'relative flex items-center shrink-0 border-b border-sidebar-border',
            isCollapsed ? 'justify-center px-3 py-4' : 'px-5 py-[14px] pr-10',
          )}
        >
          {isCollapsed ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30 text-sidebar-primary text-[11px] font-bold tracking-tight select-none">
              NH
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-sidebar-primary/25 shadow-[0_0_0_4px_rgba(23,175,149,0.06)]">
              <Image
                src="/images/logo.png"
                alt="Novahold Enterprises"
                width={100}
                height={73}
                className="block"
                priority
              />
            </div>
          )}

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={toggle}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2',
              'hidden lg:flex h-6 w-6 items-center justify-center',
              'rounded-md text-sidebar-foreground/40',
              'hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeMobile}
            className="absolute right-3 top-1/2 -translate-y-1/2 lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2" aria-label="Navegación principal">
          {SIDEBAR_NAV_SECTIONS.map((section) => (
            <div key={section.label} className="pb-2">
              {isCollapsed ? (
                <div className="pt-4 pb-1 flex justify-center">
                  <span className="block h-px w-6 bg-sidebar-foreground/10" />
                </div>
              ) : (
                <h4 className="px-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  {section.label}
                </h4>
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <SidebarNavItem
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      matchMode={item.matchMode ?? 'startsWith'}
                      collapsed={isCollapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div
          className={cn(
            'border-t border-sidebar-border shrink-0',
            isCollapsed ? 'p-3 flex justify-center' : 'p-3',
          )}
        >
          <SidebarUserCard
            name={user.name}
            email={user.email}
            image={user.image}
            role={user.role}
            collapsed={isCollapsed}
          />
        </div>
      </aside>
    </>
  );
}
