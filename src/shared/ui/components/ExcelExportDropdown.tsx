'use client';

import { useState } from 'react';
import { Download, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/shared/types/action-result';

export interface ExportOption {
  label: string;
  description?: string;
  action: () => Promise<ActionResult<{ base64: string; filename: string }>>;
}

interface ExcelExportDropdownProps {
  options: ExportOption[];
  label?: string;
  className?: string;
}

async function triggerDownload(result: ActionResult<{ base64: string; filename: string }>) {
  if (!result.ok) {
    toast.error(result.message ?? 'Error al exportar');
    return;
  }
  const { base64, filename } = result.data;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExcelExportDropdown({ options, label = 'Exportar', className }: ExcelExportDropdownProps) {
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const isLoading = loadingIndex !== null;

  async function handleExport(option: ExportOption, index: number) {
    setLoadingIndex(index);
    try {
      const result = await option.action();
      await triggerDownload(result);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setLoadingIndex(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isLoading}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium',
          'ring-offset-background transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        <Download className="h-3.5 w-3.5" />
        {isLoading ? 'Exportando…' : label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Seleccionar reporte
        </div>
        <DropdownMenuSeparator />
        {options.map((option, i) => (
          <DropdownMenuItem
            key={i}
            disabled={isLoading}
            className="gap-2.5 py-2"
            onClick={() => handleExport(option, i)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-none">{option.label}</span>
              {option.description && (
                <span className="text-[11px] leading-none text-muted-foreground">{option.description}</span>
              )}
            </div>
            {loadingIndex === i && (
              <span className="ml-auto text-[11px] text-muted-foreground">Descargando…</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
