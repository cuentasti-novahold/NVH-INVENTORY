'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'startsWith';
  collapsed?: boolean;
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  matchMode = 'startsWith',
  collapsed = false,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const active =
    matchMode === 'exact' ? pathname === href : pathname.startsWith(href);

  return (
    <div className="group/item relative">
      <Link
        href={href}
        className={cn(
          'flex items-center rounded-md transition-colors',
          collapsed
            ? 'justify-center h-9 w-full'
            : 'gap-2.5 px-3 py-2 text-sm',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )}
        aria-current={active ? 'page' : undefined}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            active
              ? 'text-sidebar-primary'
              : 'text-sidebar-foreground/50 group-hover/item:text-sidebar-foreground/80',
          )}
          aria-hidden
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>

      {/* Tooltip — only in collapsed desktop mode */}
      {collapsed && (
        <div
          className={cn(
            'pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2',
            'hidden group-hover/item:block',
            'rounded-md border border-sidebar-border bg-sidebar px-2.5 py-1.5',
            'text-xs font-medium text-sidebar-foreground whitespace-nowrap shadow-lg',
          )}
          role="tooltip"
        >
          {label}
        </div>
      )}
    </div>
  );
}
