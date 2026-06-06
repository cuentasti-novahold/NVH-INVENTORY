'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarNavItem } from '@/components/dashboard/SidebarNavItem';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import { getFilteredNavSections } from '@/components/dashboard/sidebar-nav-config';
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
          'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-primary/40',
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
        {/* Brand header */}
        <div
          className={cn(
            'flex items-center justify-center shrink-0 border-b border-sidebar-primary/20',
            isCollapsed ? 'px-3 py-4' : 'px-4 py-3',
          )}
          style={!isCollapsed ? {
            background: [
              'radial-gradient(circle, rgba(20,50,80,0.06) 1px, transparent 1px) center/18px 18px',
              'radial-gradient(ellipse at 50% 0%, oklch(0.97 0.018 210) 0%, oklch(0.91 0.035 218) 100%)',
            ].join(', '),
          } : undefined}
        >
          {isCollapsed ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary text-[11px] font-bold tracking-tight select-none">
              NH
            </div>
          ) : (
            <Image
              src="/images/logo.png"
              alt="Novahold Enterprises"
              width={120}
              height={88}
              className="block"
              priority
            />
          )}

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeMobile}
            className="absolute right-3 top-4 lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Desktop collapse toggle — mounted on the right border of the aside */}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'absolute right-0 translate-x-1/2 top-14 z-20',
            'hidden lg:flex h-6 w-6 items-center justify-center',
            'rounded-full bg-sidebar border border-sidebar-primary/40',
            'text-sidebar-foreground/60 hover:text-sidebar-foreground',
            'shadow-sm transition-colors',
          )}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2" aria-label="Navegación principal">
          {getFilteredNavSections(user.role).map((section) => (
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
