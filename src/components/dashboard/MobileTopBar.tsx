'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './sidebar-context';

export function MobileTopBar() {
  const { openMobile } = useSidebar();

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden shrink-0">
      <button
        type="button"
        onClick={openMobile}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary text-[9px] font-bold tracking-tight">
          NVH
        </div>
        <span className="text-sm font-semibold tracking-tight">Novahold</span>
      </div>
    </div>
  );
}
