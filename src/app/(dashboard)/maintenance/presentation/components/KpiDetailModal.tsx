'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { PendingMaintenanceRow } from '../dto/maintenance.dto';

export type KpiModalType = 'upcoming' | 'overdue' | null;

interface KpiDetailModalProps {
  type: KpiModalType;
  pendingRows: PendingMaintenanceRow[];
  onClose: () => void;
}

const PAGE_SIZE = 5;

const CONFIG: Record<
  Exclude<KpiModalType, null>,
  {
    title: string;
    description: string;
    icon: React.ElementType;
    headerBg: string;
    headerIcon: string;
    accentBar: string;
    emptyMessage: string;
  }
> = {
  upcoming: {
    title: 'Próximos vencimientos',
    description: 'Activos cuya próxima revisión vence en los próximos 7 días.',
    icon: Clock,
    headerBg: 'bg-amber-50/80 dark:bg-amber-950/30',
    headerIcon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    accentBar: 'bg-amber-500',
    emptyMessage: 'No hay revisiones próximas en los siguientes 7 días.',
  },
  overdue: {
    title: 'Activos atrasados',
    description: 'Equipos con revisión vencida que requieren atención inmediata.',
    icon: AlertTriangle,
    headerBg: 'bg-destructive/5 dark:bg-destructive/10',
    headerIcon: 'bg-destructive/10 text-destructive',
    accentBar: 'bg-destructive',
    emptyMessage: 'No hay activos con revisión vencida.',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function daysLabel(daysUntil: number | null): string {
  if (daysUntil === null) return 'Sin fecha';
  if (daysUntil < 0) return `hace ${Math.abs(daysUntil)} día${Math.abs(daysUntil) === 1 ? '' : 's'}`;
  if (daysUntil === 0) return 'hoy';
  return `en ${daysUntil} día${daysUntil === 1 ? '' : 's'}`;
}

export function KpiDetailModal({ type, pendingRows, onClose }: KpiDetailModalProps) {
  const [page, setPage] = useState(0);

  // Reset page when modal type changes
  useEffect(() => { setPage(0); }, [type]);

  if (!type) return null;

  const cfg = CONFIG[type];
  const Icon = cfg.icon;

  const filtered = pendingRows.filter((r) =>
    type === 'overdue' ? r.status === 'overdue' : r.status === 'upcoming',
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isOverdue = type === 'overdue';

  return (
    <Dialog open={!!type} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className={cn('relative px-5 py-4 border-b border-border', cfg.headerBg)}>
          <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', cfg.accentBar)} />
          <DialogHeader className="pl-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', cfg.headerIcon)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-sm font-semibold leading-tight">
                    {cfg.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-0.5 leading-snug">
                    {cfg.description}
                  </DialogDescription>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 -mt-0.5 -mr-1" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogHeader>
        </div>

        {/* Table body */}
        <div className="px-5 py-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {cfg.emptyMessage}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2.5 text-left font-semibold uppercase tracking-[0.06em] text-[10px] text-muted-foreground">
                    Activo
                  </th>
                  <th className="pb-2.5 text-left font-semibold uppercase tracking-[0.06em] text-[10px] text-muted-foreground">
                    Última revisión
                  </th>
                  <th className="pb-2.5 text-left font-semibold uppercase tracking-[0.06em] text-[10px] text-muted-foreground">
                    Próxima revisión
                  </th>
                  <th className="pb-2.5 text-right font-semibold uppercase tracking-[0.06em] text-[10px] text-muted-foreground">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.map((row) => (
                  <tr key={row.assetId} className="group">
                    <td className="py-3 pr-4">
                      <span className="block font-semibold font-mono text-foreground leading-none">
                        {row.assetCode}
                      </span>
                      <span className="block text-muted-foreground mt-0.5 truncate max-w-[180px]">
                        {row.assetLabel}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(row.lastRevision)}
                    </td>
                    <td className={cn('py-3 pr-4 font-medium', isOverdue ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
                      {formatDate(row.nextReview)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          isOverdue
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        )}
                      >
                        {daysLabel(row.daysUntil)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer: pagination + close */}
        <div className="border-t border-border bg-muted/30 px-5 py-3 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            {filtered.length} activo{filtered.length !== 1 ? 's' : ''}
            {totalPages > 1 && ` · página ${page + 1} de ${totalPages}`}
          </span>
          <div className="flex items-center gap-2">
            {totalPages > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
