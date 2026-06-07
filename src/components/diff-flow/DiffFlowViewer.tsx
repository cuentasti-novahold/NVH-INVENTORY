'use client';

import { useMemo } from 'react';

// ─── diff engine ──────────────────────────────────────────────────────────────

export type DiffType = 'changed' | 'added' | 'removed';

export interface FieldDiff {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  type: DiffType;
}

function toObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function formatDiffValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

const FIELD_LABELS: Record<string, string> = {
  locationId: 'Ubicación',
  locationName: 'Ubicación',
  bodegaId: 'Bodega',
  bodegaName: 'Bodega',
  categoryId: 'Categoría',
  assetCode: 'Código de activo',
  generalStatus: 'Estado general',
  functionalStatus: 'Estado funcional',
  isActive: 'Activo',
  purchaseDate: 'Fecha de compra',
  purchasePrice: 'Precio (COP)',
  purchasePriceBase: 'Precio base',
  serialNumber: 'Número de serie',
  assetTag: 'Tag de activo',
  hostname: 'Hostname',
  employeeId: 'Empleado',
  assignedAt: 'Asignado',
  returnedAt: 'Devuelto',
  maintenanceType: 'Tipo de mantenimiento',
  scheduledAt: 'Programado para',
  completedAt: 'Completado',
};

const NAME_REPLACES_ID: Record<string, string> = {
  locationName: 'locationId',
  bodegaName: 'bodegaId',
};

function humanLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export function computeDiff(before: unknown, after: unknown): FieldDiff[] {
  const b = toObj(before);
  const a = toObj(after);
  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));

  const suppressedIds = new Set<string>();
  for (const [nameKey, idKey] of Object.entries(NAME_REPLACES_ID)) {
    if (allKeys.includes(nameKey)) suppressedIds.add(idKey);
  }

  const keys = allKeys.filter((k) => !suppressedIds.has(k));
  const diffs: FieldDiff[] = [];

  for (const key of keys) {
    const inBefore = key in b;
    const inAfter = key in a;
    const bVal = b[key];
    const aVal = a[key];

    if (!inBefore) {
      diffs.push({ key, label: humanLabel(key), before: undefined, after: aVal, type: 'added' });
    } else if (!inAfter) {
      diffs.push({ key, label: humanLabel(key), before: bVal, after: undefined, type: 'removed' });
    } else if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diffs.push({ key, label: humanLabel(key), before: bVal, after: aVal, type: 'changed' });
    }
  }

  return diffs;
}

// ─── animated arrow ───────────────────────────────────────────────────────────
// Uses SVG native <animate> — works independently of CSS keyframe timing.

function AnimatedArrow() {
  const DUR = '1.8s';
  const TO = 54; // x destination before the arrowhead

  return (
    <div className="flex items-center justify-center w-20 shrink-0 animate-in fade-in duration-700 delay-300">
      <svg
        width="80"
        height="24"
        viewBox="0 0 80 24"
        fill="none"
        overflow="visible"
        aria-hidden
      >
        <defs>
          <filter id="diff-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* static track line — navy at low opacity for light background */}
        <line
          x1="0"
          y1="12"
          x2="56"
          y2="12"
          stroke="rgba(0,54,95,0.18)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* glow halo */}
        <circle r="6" cy="12" fill="#17af95" filter="url(#diff-glow)">
          <animate attributeName="cx" from="0" to={TO} dur={DUR} repeatCount="indefinite" calcMode="linear" />
          <animate
            attributeName="opacity"
            values="0;0.45;0.45;0"
            keyTimes="0;0.06;0.88;1"
            dur={DUR}
            repeatCount="indefinite"
          />
        </circle>

        {/* solid travelling dot */}
        <circle r="2.5" cy="12" fill="#17af95">
          <animate attributeName="cx" from="0" to={TO} dur={DUR} repeatCount="indefinite" calcMode="linear" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.06;0.88;1"
            dur={DUR}
            repeatCount="indefinite"
          />
        </circle>

        {/* arrowhead */}
        <path
          d="M56 6 L70 12 L56 18 Z"
          fill="rgba(23,175,149,0.5)"
        />
      </svg>
    </div>
  );
}

// ─── state card ───────────────────────────────────────────────────────────────

interface StateField {
  label: string;
  value: string;
  isEmpty: boolean;
}

function StateCard({
  title,
  fields,
  side,
}: {
  title: string;
  fields: StateField[];
  side: 'before' | 'after';
}) {
  const isBefore = side === 'before';

  // Before: neutral — the past state. After: teal — the current truth.
  const wrapperBorder = isBefore ? 'border-slate-200' : 'border-[#17af95]/30';
  const headerBg = isBefore ? 'bg-[#00365f]/[0.04]' : 'bg-[#17af95]/[0.06]';
  const headerBorder = isBefore ? 'border-slate-100' : 'border-[#17af95]/15';
  const dotColor = isBefore ? '#94a3b8' : '#17af95';
  const titleColor = isBefore ? 'rgba(0,54,95,0.7)' : '#17af95';
  const rowBorder = isBefore ? 'border-slate-100' : 'border-[#17af95]/10';
  const animClass = isBefore
    ? 'animate-in fade-in slide-in-from-left-5 duration-500'
    : 'animate-in fade-in slide-in-from-right-5 duration-500';

  return (
    <div className={`flex-1 min-w-0 bg-white rounded-md border overflow-hidden ${wrapperBorder} ${animClass}`}>
      {/* header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${headerBg} ${headerBorder}`}>
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: titleColor }}
        >
          {title}
        </p>
      </div>

      {/* field rows */}
      <div>
        {fields.map((field, i) => (
          <div
            key={i}
            className={`px-4 py-3 ${i < fields.length - 1 ? `border-b ${rowBorder}` : ''}`}
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              {field.label}
            </p>
            <p
              className="font-mono text-[12px] leading-snug break-all"
              style={{
                color: field.isEmpty
                  ? '#cbd5e1'
                  : isBefore
                    ? '#475569'
                    : '#17af95',
                fontStyle: field.isEmpty ? 'italic' : 'normal',
                fontWeight: !field.isEmpty && !isBefore ? 500 : 400,
              }}
            >
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface DiffFlowViewerProps {
  /** Raw JSON snapshot before the change */
  before: unknown;
  /** Raw JSON snapshot after the change */
  after: unknown;
  noDataMessage?: string;
  noDiffMessage?: string;
  className?: string;
}

export function DiffFlowViewer({
  before,
  after,
  noDataMessage = 'Sin datos de cambio registrados para este evento.',
  noDiffMessage = 'No se detectaron diferencias entre el estado anterior y el actual.',
  className,
}: DiffFlowViewerProps) {
  const diffs = useMemo(() => computeDiff(before, after), [before, after]);
  const noData = before === null && after === null;

  if (noData) return <EmptyState message={noDataMessage} className={className} />;
  if (diffs.length === 0) return <EmptyState message={noDiffMessage} className={className} />;

  const beforeFields = diffs.map((d) => ({
    label: d.label,
    value: d.type === 'added' ? '—' : formatDiffValue(d.before),
    isEmpty: d.type === 'added',
  }));

  const afterFields = diffs.map((d) => ({
    label: d.label,
    value: d.type === 'removed' ? '—' : formatDiffValue(d.after),
    isEmpty: d.type === 'removed',
  }));

  return (
    <div className={className}>
      {/*
        Light document-surface container — audit trail reads like a document, not a terminal.
        Cards are separate on a barely-tinted slate-50 background.
        Arrow bridges before → after with the traveling teal dot.
      */}
      <div className="rounded-md bg-slate-50 border border-slate-200/80 p-3">
        <div className="flex items-stretch gap-0">
          <StateCard title="Estado anterior" fields={beforeFields} side="before" />
          <AnimatedArrow />
          <StateCard title="Estado actual" fields={afterFields} side="after" />
        </div>
      </div>

      <p className="mt-2 text-right text-[11px] text-muted-foreground/40">
        {diffs.length} {diffs.length === 1 ? 'campo modificado' : 'campos modificados'}
      </p>
    </div>
  );
}

function EmptyState({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center py-10 text-sm text-muted-foreground ${className ?? ''}`}
    >
      {message}
    </div>
  );
}
