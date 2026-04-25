'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FilterBar, type FilterBarToggle } from '@/components/dashboard/FilterBar';
import { ExcelExportDropdown, type ExportOption } from '@/shared/ui/components/ExcelExportDropdown';

export interface ToolbarAction {
  label: string;
  icon?: ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  onClick: () => void;
}

export interface TablePageToolbarConfig {
  search?: {
    value: string;
    onChange: (q: string) => void;
    placeholder?: string;
  };
  toggles?: FilterBarToggle[];
  exports?: ExportOption[];
  actions?: ToolbarAction[];
}

interface TablePageToolbarProps {
  config: TablePageToolbarConfig;
}

export function TablePageToolbar({ config }: TablePageToolbarProps) {
  const hasLeft = config.search !== undefined || (config.toggles?.length ?? 0) > 0;
  const hasRight = (config.exports?.length ?? 0) > 0 || (config.actions?.length ?? 0) > 0;

  if (!hasLeft && !hasRight) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasLeft && (
        <FilterBar
          searchValue={config.search?.value ?? ''}
          onSearchChange={config.search?.onChange ?? (() => {})}
          searchPlaceholder={config.search?.placeholder}
          showSearch={config.search !== undefined}
          toggles={config.toggles}
          className={hasRight ? 'flex-1 min-w-[280px]' : 'w-full'}
        />
      )}

      {hasRight && (
        <div className={`flex items-center gap-2 shrink-0 ${!hasLeft ? 'ml-auto' : ''}`}>
          {config.exports && config.exports.length > 0 && (
            <ExcelExportDropdown options={config.exports} />
          )}
          {config.actions?.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant ?? 'default'}
              className="h-9 gap-1.5 text-xs"
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
