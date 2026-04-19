'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, CheckCircle2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { validateAppUrl } from './lib/validateAppUrl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const QRScanner = dynamic(
  () => import('@/shared/ui/components/QRScanner').then((m) => m.QRScanner),
  { ssr: false },
);

export default function ScannerPage() {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'ready' | 'success'>('ready');

  function handleDecode(url: string) {
    const path = validateAppUrl(url);
    if (path) {
      setStatus('success');
      setPaused(true);
      setTimeout(() => router.push(path), 700);
    } else {
      toast.error('QR no reconocido. Escaneá un código de activo Novahold.');
    }
  }

  function handleError(err: Error) {
    if (
      err.message.toLowerCase().includes('permission') ||
      err.message.toLowerCase().includes('notallowed')
    ) {
      toast.error('Se requiere permiso de cámara para usar el escáner.');
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <QrCode className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Escáner QR</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Identificación rápida de activos mediante código QR
        </p>
      </div>

      {/* Content grid — scanner left, context right */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ── Scanner panel ── */}
        <div className="space-y-3">
          {/* Status bar */}
          <div className="flex items-center justify-between px-0.5">
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 text-xs font-medium transition-all duration-300',
                status === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-accent/40 bg-accent/10 text-accent',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  status === 'success' ? 'bg-emerald-500' : 'bg-accent animate-pulse',
                )}
              />
              {status === 'success' ? 'Activo identificado — redirigiendo…' : 'Cámara activa'}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="h-3 w-3" />
              Trasera
            </span>
          </div>

          {/* Viewport */}
          <div
            className={cn(
              'relative rounded-xl overflow-hidden border bg-zinc-950',
              'transition-all duration-300',
              status === 'success'
                ? 'ring-2 ring-emerald-500/50 border-emerald-500/30'
                : 'border-border',
            )}
          >
            {/* HUD corner brackets */}
            <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden>
              <span className="absolute top-7 left-7 h-6 w-6 border-t-2 border-l-2 border-accent" />
              <span className="absolute top-7 right-7 h-6 w-6 border-t-2 border-r-2 border-accent" />
              <span className="absolute bottom-7 left-7 h-6 w-6 border-b-2 border-l-2 border-accent" />
              <span className="absolute bottom-7 right-7 h-6 w-6 border-b-2 border-r-2 border-accent" />
            </div>

            {/* Scan sweep line */}
            {status === 'ready' && (
              <div
                className="absolute left-7 right-7 z-10 h-px pointer-events-none qr-sweep"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, oklch(0.638 0.129 174 / 80%), transparent)',
                }}
                aria-hidden
              />
            )}

            {/* Success overlay */}
            {status === 'success' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-emerald-950/70 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="flex flex-col items-center gap-3 animate-in zoom-in-75 duration-300">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-emerald-300">Activo identificado</span>
                </div>
              </div>
            )}

            <QRScanner onDecode={handleDecode} onError={handleError} paused={paused} />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Encuadrá el código QR dentro del área delimitada
          </p>
        </div>

        {/* ── Context panels ── */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Instrucciones
            </h2>
            <ol className="space-y-4">
              {[
                {
                  n: '01',
                  title: 'Permitir cámara',
                  desc: 'Cuando el navegador solicite acceso, aceptá el permiso de cámara.',
                },
                {
                  n: '02',
                  title: 'Apuntar al código',
                  desc: 'Encuadrá el QR del activo dentro del área de escaneo.',
                },
                {
                  n: '03',
                  title: 'Redirección automática',
                  desc: 'El sistema detecta el código y te lleva al detalle del activo.',
                },
              ].map(({ n, title, desc }) => (
                <li key={n} className="flex gap-3">
                  <span className="w-6 shrink-0 font-mono text-xs font-bold text-accent mt-0.5">
                    {n}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-none mb-1">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Formato de código
            </h2>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 px-4 py-3 font-mono text-sm">
              <span className="text-muted-foreground">NVH-</span>
              <span className="font-semibold text-foreground">PC</span>
              <span className="text-muted-foreground">-</span>
              <span className="font-semibold text-foreground">00001</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Prefijo de categoría + número secuencial de 5 dígitos
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Prefijos de categoría
            </h2>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {['PC', 'DSK', 'MON', 'KB', 'MSE', 'CHG', 'PHN', 'EXT', 'ERG', 'RJ45', 'HDST'].map(
                (prefix) => (
                  <div
                    key={prefix}
                    className="flex items-center justify-center rounded-md bg-muted/50 px-2 py-1.5 font-mono text-xs font-medium text-muted-foreground"
                  >
                    {prefix}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
