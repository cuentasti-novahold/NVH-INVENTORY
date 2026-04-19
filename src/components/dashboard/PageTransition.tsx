'use client';

import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="flex-1 overflow-auto flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
    >
      {children}
    </div>
  );
}
