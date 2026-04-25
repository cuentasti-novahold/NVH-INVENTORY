'use client';

import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface PageHeaderAction {
  title: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
}

interface PageHeaderConfig {
  /**
   * @deprecated Use FilterBar instead for filter controls.
   * This prop remains functional but new modules should not use it.
   */
  filters?: PageHeaderAction[];
  import?: PageHeaderAction[];
}

interface PageHeaderProps {
  pageHeader: PageHeaderConfig;
}

export function PageHeader({ pageHeader }: PageHeaderProps) {
  const filters = pageHeader.filters ?? [];
  const actions = pageHeader.import ?? [];
  const hasFilters = filters.length > 0;
  const hasActions = actions.length > 0;

  if (!hasFilters && !hasActions) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      {hasFilters && (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {filters.map((filter, i) => (
            <Button
              key={i}
              variant={filter.variant === 'default' ? 'default' : 'ghost'}
              size="sm"
              className={
                filter.variant === 'default'
                  ? 'h-7 px-3 text-xs rounded-md'
                  : 'h-7 px-3 text-xs rounded-md text-muted-foreground hover:text-foreground'
              }
              onClick={filter.onClick}
            >
              {filter.icon}
              {filter.title}
            </Button>
          ))}
        </div>
      )}
      {hasActions && (
        <div className="ml-auto flex items-center gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={action.onClick}
            >
              {action.icon}
              {action.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
