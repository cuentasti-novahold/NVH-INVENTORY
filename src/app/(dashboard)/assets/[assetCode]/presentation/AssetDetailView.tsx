'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  ArrowLeft,
  Printer,
  FileText,
  UserX,
  MapPin,
  Cpu,
  Tag,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AssetQRCode } from '@/shared/ui/components/AssetQRCode';
import { cn } from '@/lib/utils';
import type { AssetDetailRow, AssetStatus } from '../../presentation/dto/asset.dto';

const AssetLabelDownload = dynamic(
  () => import('./AssetLabelDownload').then((m) => m.AssetLabelDownload),
  { ssr: false },
);

const AssetHistoryDownload = dynamic(
  () => import('./AssetHistoryDownload').then((m) => m.AssetHistoryDownload),
  { ssr: false },
);

/* ── Status config ──────────────────────────────────── */

const STATUS_CONFIG: Record<AssetStatus, { label: string; className: string }> = {
  GOOD: {
    label: 'Bueno',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  REGULAR: {
    label: 'Regular',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  BAD: {
    label: 'Malo',
    className: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  },
  DAMAGED: {
    label: 'Dañado',
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  RETIRED: {
    label: 'Retirado',
    className: 'border-border bg-muted/60 text-muted-foreground',
  },
};

/* ── Field primitives ───────────────────────────────── */

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground truncate">{value}</dd>
    </div>
  );
}

function FieldGroup({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />}
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">{children}</dl>
    </div>
  );
}

/* ── Main component ─────────────────────────────────── */

interface AssetDetailViewProps {
  asset: AssetDetailRow;
}

export function AssetDetailView({ asset }: AssetDetailViewProps) {
  const [showLabel, setShowLabel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fc = asset.categoryFieldConfig ?? {};
  const isVisible = (field: string) => fc[field] !== 'hidden';

  const statusCfg = STATUS_CONFIG[asset.generalStatus] ?? STATUS_CONFIG.GOOD;

  const hasSpecs =
    (isVisible('processor') && asset.processor) ||
    (isVisible('ram') && asset.ram) ||
    (isVisible('storageCapacity') && asset.storageCapacity) ||
    (isVisible('operatingSystem') && asset.operatingSystem) ||
    (isVisible('phoneNumber') && asset.phoneNumber) ||
    (isVisible('imei') && asset.imei);

  const formatPrice = (val: string | null) =>
    val ? `$${Number(val).toLocaleString('es-CO')}` : null;

  const formatDate = (val: string | null) =>
    val ? new Date(val).toLocaleDateString('es-CO') : null;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Ruta">
        <Link href="/assets" className="hover:text-foreground transition-colors">
          Activos
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-foreground">{asset.assetCode}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/assets" aria-label="Volver a activos">
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          </Link>
          <div className="min-w-0">
            <h1 className="font-mono text-2xl font-semibold tracking-tight leading-none">
              {asset.assetCode}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{asset.categoryName}</span>
              {asset.isActive && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Activo
                </span>
              )}
            </div>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn('shrink-0 text-xs font-medium px-2.5 py-1', statusCfg.className)}
        >
          {statusCfg.label}
        </Badge>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* ── Left: QR passport + actions ── */}
        <div className="space-y-3">
          {/* Passport card */}
          <div className="rounded-xl border bg-card p-5 flex flex-col items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Código de activo
            </span>
            <div className="rounded-lg overflow-hidden border border-border/60 p-2 bg-white">
              <AssetQRCode assetCode={asset.assetCode} size={160} />
            </div>
            <code className="font-mono text-xs font-semibold tracking-wider text-foreground">
              {asset.assetCode}
            </code>
          </div>

          {/* Action buttons */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 justify-start"
            onClick={() => setShowLabel(true)}
          >
            <Printer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Imprimir etiqueta
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 justify-start"
            onClick={() => setShowHistory(true)}
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Descargar historial
          </Button>

          {showLabel && (
            <AssetLabelDownload
              assetCode={asset.assetCode}
              brand={asset.brand}
              model={asset.model}
              onDone={() => setShowLabel(false)}
            />
          )}
          {showHistory && (
            <AssetHistoryDownload
              assetCode={asset.assetCode}
              onDone={() => setShowHistory(false)}
            />
          )}
        </div>

        {/* ── Right: info panel ── */}
        <div className="rounded-xl border bg-card divide-y divide-border">
          {/* Identificación */}
          <div className="p-5">
            <FieldGroup title="Identificación" icon={Tag}>
              <Field label="Marca" value={asset.brand} />
              <Field label="Modelo" value={asset.model} />
              <Field label="Serial" value={asset.serialNumber} />
              {asset.hostname && <Field label="Hostname" value={asset.hostname} />}
              {asset.assetTag && <Field label="Asset Tag" value={asset.assetTag} />}
            </FieldGroup>
          </div>

          {/* Especificaciones — rendered only if something is visible */}
          {hasSpecs && (
            <div className="p-5">
              <FieldGroup title="Especificaciones" icon={Cpu}>
                {isVisible('processor') && (
                  <Field label="Procesador" value={asset.processor} />
                )}
                {isVisible('ram') && <Field label="RAM" value={asset.ram} />}
                {isVisible('storageCapacity') && (
                  <Field
                    label="Almacenamiento"
                    value={
                      asset.storageCapacity
                        ? `${asset.storageCapacity}${asset.storageType ? ` (${asset.storageType})` : ''}`
                        : null
                    }
                  />
                )}
                {isVisible('operatingSystem') && (
                  <Field label="Sistema operativo" value={asset.operatingSystem} />
                )}
                {isVisible('phoneNumber') && (
                  <Field label="Teléfono" value={asset.phoneNumber} />
                )}
                {isVisible('imei') && <Field label="IMEI" value={asset.imei} />}
              </FieldGroup>
            </div>
          )}

          {/* Ubicación */}
          <div className="p-5">
            <FieldGroup title="Ubicación" icon={MapPin}>
              <Field label="Sede" value={asset.locationName} />
              <Field label="Bodega" value={asset.bodegaName} />
            </FieldGroup>
          </div>

          {/* Financiero */}
          <div className="p-5">
            <FieldGroup title="Financiero" icon={DollarSign}>
              <Field
                label="Precio de compra (COP)"
                value={formatPrice(asset.purchasePriceBase)}
              />
              <Field label="Fecha de compra" value={formatDate(asset.purchaseDate)} />
              <Field
                label="Vida útil"
                value={asset.usefulLifeYears ? `${asset.usefulLifeYears} años` : null}
              />
              {asset.salvageValue && (
                <Field
                  label="Valor residual"
                  value={formatPrice(asset.salvageValue)}
                />
              )}
            </FieldGroup>
          </div>
        </div>
      </div>

      {/* ── Asignación actual ── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Asignación actual
        </h2>
        {asset.activeAssignment ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {(asset.activeAssignment.employeeName[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {asset.activeAssignment.employeeName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Desde{' '}
                  {new Date(asset.activeAssignment.assignedAt).toLocaleDateString('es-CO')}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
            >
              Asignado
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed bg-muted/30 p-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserX className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">Sin asignación activa</p>
          </div>
        )}
      </div>

      {/* ── Observaciones ── */}
      {asset.notes && (
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Observaciones
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{asset.notes}</p>
        </div>
      )}
    </div>
  );
}
