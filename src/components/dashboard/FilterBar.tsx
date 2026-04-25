'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/shared/presentation/hooks/use-debounce';
import { cn } from '@/lib/utils';

export interface FilterBarToggle {
  label: string;
  active: boolean;
  onClick: () => void;
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder?: string;
  toggles?: FilterBarToggle[];
  showSearch?: boolean;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  toggles,
  showSearch = true,
  className,
}: FilterBarProps) {
  const [inputValue, setInputValue] = useState(searchValue);

  // Mirror external changes (browser back, programmatic clear)
  useEffect(() => {
    setInputValue(searchValue);
  }, [searchValue]);

  const debounced = useDebounce(inputValue, 300);

  // Emit only when debounced value genuinely differs from canonical (prevents mount/sync emit)
  useEffect(() => {
    if (debounced !== searchValue) onSearchChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const hasToggles = !!toggles && toggles.length > 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        showSearch ? 'justify-between' : 'justify-end',
        className,
      )}
    >
      {showSearch && (
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Buscar"
            className="h-9 pl-8"
          />
        </div>
      )}

      {hasToggles && (
        <div
          role="group"
          aria-label="Filtros"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
        >
          {toggles!.map((t, i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant={t.active ? 'default' : 'ghost'}
              aria-pressed={t.active}
              className={cn(
                'h-7 rounded-md px-3 text-xs',
                !t.active && 'text-muted-foreground hover:text-foreground',
              )}
              onClick={t.onClick}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
