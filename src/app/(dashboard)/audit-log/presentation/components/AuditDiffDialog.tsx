'use client';

import { User, Clock, Hash } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiffFlowViewer } from '@/components/diff-flow/DiffFlowViewer';
import type { AuditLogRow } from '../dto/audit-log.dto';

// ─── action badge ─────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, string> = {
  CREATE:  'bg-[#17af95]/10 text-[#17af95] border-[#17af95]/25',
  UPDATE:  'bg-primary/10 text-primary border-primary/20',
  DELETE:  'bg-destructive/10 text-destructive border-destructive/20',
  MOVED:   'bg-amber-500/10 text-amber-600 border-amber-400/30',
  RESTORE: 'bg-[#17af95]/10 text-[#17af95] border-[#17af95]/25',
};

function ActionBadge({ action }: { action: string }) {
  const cls =
    ACTION_STYLES[action.toUpperCase()] ??
    'bg-muted text-muted-foreground border-border';
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold tracking-widest uppercase ${cls}`}
    >
      {action}
    </span>
  );
}

// ─── dialog ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  row: AuditLogRow | null;
  onOpenChange: (open: boolean) => void;
}

export function AuditDiffDialog({ open, row, onOpenChange }: Props) {
  if (!row) return null;

  const createdAt = row.createdAt
    ? new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(row.createdAt))
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xl sm:max-w-2xl p-0 overflow-hidden gap-0">
        {/* ── header ── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60 bg-muted/30 space-y-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <DialogTitle className="text-sm font-semibold text-foreground">
              {row.entity}
            </DialogTitle>
            <ActionBadge action={row.action} />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Hash className="h-3 w-3 shrink-0" />
              <span className="font-mono">{row.entityId}</span>
            </span>
            {(row.userName ?? row.userEmail) && (
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3 shrink-0" />
                {row.userName ?? row.userEmail}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              {createdAt}
            </span>
          </div>
        </DialogHeader>

        {/* ── diff body ── */}
        <div className="px-5 py-4 overflow-y-auto max-h-[62vh]">
          <DiffFlowViewer before={row.before} after={row.after} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
