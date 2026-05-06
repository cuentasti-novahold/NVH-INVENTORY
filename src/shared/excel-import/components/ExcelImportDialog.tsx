'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  previewImportAction,
  confirmImportAction,
  getImportTemplateAction,
  getImportSchemaAction,
  type ImportSchemaSummary,
} from '../actions';
import type { ImportPreviewResult, ImportConfirmResult } from '../types';

// ─── State machine ─────────────────────────────────────────────────────────

type DialogState =
  | { kind: 'idle' }
  | { kind: 'selecting'; file: File }
  | { kind: 'previewing' }
  | { kind: 'preview-result'; preview: ImportPreviewResult; file: File }
  | { kind: 'confirming' }
  | { kind: 'done'; result: ImportConfirmResult }
  | { kind: 'error'; message: string };

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleKey: string;
  title: string;
  description?: string;
  onSuccess?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 10;

// ─── Stepper ────────────────────────────────────────────────────────────────

type StepKey = 'upload' | 'review' | 'process';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'upload', label: 'Subir' },
  { key: 'review', label: 'Revisar' },
  { key: 'process', label: 'Procesar' },
];

function getActiveStep(state: DialogState): StepKey {
  switch (state.kind) {
    case 'preview-result':
      return 'review';
    case 'confirming':
    case 'done':
      return 'process';
    default:
      return 'upload';
  }
}

function Stepper({ active }: { active: StepKey }) {
  const activeIndex = STEPS.findIndex((s) => s.key === active);
  return (
    <div className="flex items-start">
      {STEPS.map((step, i) => {
        const status =
          i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
        return (
          <Fragment key={step.key}>
            <div className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition-colors',
                  status === 'active' &&
                    'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30 ring-4 ring-primary/10',
                  status === 'done' &&
                    'border-emerald-500 bg-emerald-500 text-white',
                  status === 'pending' &&
                    'border-border bg-background text-muted-foreground',
                )}
              >
                {status === 'done' ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium tracking-wide',
                  status === 'active' && 'text-foreground',
                  status === 'done' && 'text-foreground/70',
                  status === 'pending' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  '-mx-1 mt-3 h-px flex-1 transition-colors',
                  status === 'done' ? 'bg-emerald-500/60' : 'bg-border',
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBase64(base64: string, fileName: string): void {
  const byteCharacters = atob(base64);
  const byteNumbers = Array.from({ length: byteCharacters.length }, (_, i) =>
    byteCharacters.charCodeAt(i),
  );
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ExcelImportDialog({
  open,
  onOpenChange,
  moduleKey,
  title,
  description,
  onSuccess,
}: ExcelImportDialogProps) {
  const [state, setState] = useState<DialogState>({ kind: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const [schema, setSchema] = useState<ImportSchemaSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState({ kind: 'idle' });
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await getImportSchemaAction(moduleKey);
      if (!cancelled && res.ok) setSchema(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, moduleKey]);

  // ─── File selection ─────────────────────────────────────────────────────

  function acceptFile(file: File): boolean {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Solo se aceptan archivos .xlsx');
      return false;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('El archivo supera el límite de 10 MB');
      return false;
    }
    setState({ kind: 'selecting', file });
    return true;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!acceptFile(file)) e.target.value = '';
  }

  function onDragOver(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }

  // ─── Template ───────────────────────────────────────────────────────────

  async function onDownloadTemplate() {
    const res = await getImportTemplateAction(moduleKey);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    downloadBase64(res.data.fileBase64, res.data.fileName);
  }

  // ─── Preview ────────────────────────────────────────────────────────────

  async function onPreview() {
    if (state.kind !== 'selecting') return;
    const { file } = state;
    setState({ kind: 'previewing' });

    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch {
      setState({ kind: 'error', message: 'No se pudo leer el archivo' });
      return;
    }

    const res = await previewImportAction(moduleKey, base64, file.name);
    if (!res.ok) {
      setState({ kind: 'error', message: res.message });
      return;
    }
    setState({ kind: 'preview-result', preview: res.data, file });
  }

  function onDownloadErrors(errorFileBase64: string, suffix = 'errores') {
    downloadBase64(errorFileBase64, `${moduleKey}-${suffix}.xlsx`);
  }

  // ─── Confirm ────────────────────────────────────────────────────────────

  async function onConfirm() {
    if (state.kind !== 'preview-result') return;
    const { file } = state;
    setState({ kind: 'confirming' });

    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch {
      setState({ kind: 'error', message: 'No se pudo leer el archivo' });
      return;
    }

    const res = await confirmImportAction(moduleKey, base64, file.name);
    if (!res.ok) {
      setState({ kind: 'error', message: res.message });
      return;
    }
    setState({ kind: 'done', result: res.data });
  }

  function onClose() {
    onSuccess?.();
    onOpenChange(false);
  }

  function onReset() {
    setState({ kind: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const showUploadStage =
    state.kind === 'idle' ||
    state.kind === 'selecting' ||
    state.kind === 'previewing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-xl border border-border/80 p-0 shadow-2xl shadow-black/10">
        {/* ── Header ── */}
        <DialogHeader className="space-y-0 border-b border-border/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <FileSpreadsheet className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <DialogTitle className="text-[15px] font-semibold leading-tight tracking-tight">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs leading-snug text-muted-foreground">
                {description ?? 'Importá registros desde un archivo Excel.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Stepper ── */}
        <div className="border-b border-border/70 bg-muted/10 px-10 py-4">
          <Stepper active={getActiveStep(state)} />
        </div>

        {/* ── Body ── */}
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-6 py-5">
          {/* Hidden file input — always mounted */}
          <input
            ref={fileInputRef}
            id="excel-file-v2"
            type="file"
            accept=".xlsx"
            onChange={onFileChange}
            className="hidden"
          />

          {/* ── Upload stage: dropzone (idle / selecting / previewing) ── */}
          {showUploadStage && (
            <div
              role={state.kind === 'idle' ? 'button' : undefined}
              tabIndex={state.kind === 'idle' ? 0 : -1}
              onClick={
                state.kind === 'idle'
                  ? () => fileInputRef.current?.click()
                  : undefined
              }
              onKeyDown={
                state.kind === 'idle'
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }
                  : undefined
              }
              onDragOver={state.kind === 'idle' ? onDragOver : undefined}
              onDragLeave={state.kind === 'idle' ? onDragLeave : undefined}
              onDrop={state.kind === 'idle' ? onDrop : undefined}
              className={cn(
                'group relative flex min-h-[160px] w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border border-dashed px-6 py-6 text-center transition-colors',
                'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                state.kind === 'idle' && !isDragging &&
                  'cursor-pointer border-border/60 bg-muted/15 hover:border-border hover:bg-muted/30',
                state.kind === 'idle' && isDragging &&
                  'cursor-pointer border-primary bg-primary/5',
                state.kind === 'selecting' &&
                  'border-emerald-500/40 bg-emerald-500/[0.04]',
                state.kind === 'previewing' && 'border-border bg-muted/20',
              )}
            >
              {/* Subtle spreadsheet line pattern */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(to_bottom,transparent_19px,currentColor_19px,currentColor_20px)] [background-size:100%_20px]"
              />

              {state.kind === 'idle' && (
                <>
                  <div
                    className={cn(
                      'relative flex h-12 w-12 items-center justify-center rounded-full border transition-colors',
                      isDragging
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/70 bg-background text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="relative flex flex-col gap-0.5">
                    <p className="text-[15px] font-semibold leading-tight text-foreground">
                      {isDragging
                        ? 'Soltá el archivo para cargarlo'
                        : 'Arrastrá tu archivo aquí'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      o hacé clic para seleccionarlo
                    </p>
                  </div>
                  <div className="relative flex flex-wrap items-center justify-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-border/70 bg-background text-muted-foreground"
                    >
                      .xlsx
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-border/70 bg-background text-muted-foreground"
                    >
                      Máximo 10 MB
                    </Badge>
                  </div>
                </>
              )}

              {state.kind === 'selecting' && (
                <>
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/40 ring-4 ring-emerald-500/10">
                    <Check className="h-6 w-6" strokeWidth={3} />
                  </div>
                  <div className="relative flex flex-col items-center gap-0.5">
                    <p className="text-[15px] font-semibold leading-tight text-foreground">
                      Archivo listo para previsualizar
                    </p>
                    <p className="max-w-[420px] truncate text-xs text-muted-foreground">
                      {state.file.name}
                    </p>
                  </div>
                  <div className="relative flex flex-wrap items-center justify-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    >
                      {formatBytes(state.file.size)}
                    </Badge>
                    <button
                      type="button"
                      onClick={onReset}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      Quitar archivo
                    </button>
                  </div>
                </>
              )}

              {state.kind === 'previewing' && (
                <div className="relative flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    Procesando archivo...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Validando filas y columnas
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Template card (only on upload stage) ── */}
          {showUploadStage && (
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium leading-tight text-foreground">
                  Descargar plantilla
                </p>
                <p className="truncate text-xs leading-snug text-muted-foreground">
                  Formato .xlsx con las columnas requeridas
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={onDownloadTemplate}
              >
                Descargar
              </Button>
            </div>
          )}

          {/* ── Schema fields section (only on upload stage) ── */}
          {showUploadStage && schema && (schema.requiredFields.length > 0 || schema.optionalFields.length > 0) && (
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                  Campos del archivo
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {schema.requiredFields.length > 0 && (
                    <Badge
                      variant="outline"
                      className="whitespace-nowrap border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400"
                    >
                      {schema.requiredFields.length} obligatorios
                    </Badge>
                  )}
                  {schema.optionalFields.length > 0 && (
                    <Badge
                      variant="outline"
                      className="whitespace-nowrap border-border/70 bg-background text-muted-foreground"
                    >
                      {schema.optionalFields.length} opcionales
                    </Badge>
                  )}
                </span>
              </div>

              {schema.requiredFields.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Obligatorios
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {schema.requiredFields.map((f) => (
                      <Badge
                        key={f}
                        variant="outline"
                        className="border-border/70 bg-background text-foreground"
                      >
                        {f}
                        <span className="ml-0.5 text-rose-500">*</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {schema.optionalFields.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Opcionales
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {schema.optionalFields.map((f) => (
                      <Badge
                        key={f}
                        variant="outline"
                        className="border-border/70 bg-background text-muted-foreground"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Preview-result ── */}
          {state.kind === 'preview-result' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Filas válidas
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {state.preview.validCount}
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                    state.preview.errorCount > 0
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-border bg-muted/20',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                      state.preview.errorCount > 0
                        ? 'bg-destructive/10'
                        : 'bg-muted',
                    )}
                  >
                    <AlertCircle
                      className={cn(
                        'h-4 w-4',
                        state.preview.errorCount > 0
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                      )}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Filas con error
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        state.preview.errorCount > 0
                          ? 'text-destructive'
                          : 'text-foreground',
                      )}
                    >
                      {state.preview.errorCount}
                    </span>
                  </div>
                </div>
              </div>

              {state.preview.errors.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <p className="text-xs font-semibold text-destructive">
                    {state.preview.errors.length > MAX_ERRORS_SHOWN
                      ? `Primeros ${MAX_ERRORS_SHOWN} de ${state.preview.errors.length} errores`
                      : `${state.preview.errors.length} ${state.preview.errors.length === 1 ? 'error' : 'errores'}`}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {state.preview.errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-xs text-destructive/90"
                      >
                        <span className="shrink-0 font-medium tabular-nums">
                          Fila {e.row}
                        </span>
                        <span className="text-destructive/70">
                          {e.field ? `${e.field} · ` : ''}
                          {e.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {state.preview.errorFileBase64 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => onDownloadErrors(state.preview.errorFileBase64!)}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Descargar archivo de errores
                </Button>
              )}
            </div>
          )}

          {/* ── Confirming ── */}
          {state.kind === 'confirming' && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Importando...
            </div>
          )}

          {/* ── Done ── */}
          {state.kind === 'done' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold tracking-tight text-foreground">
                  Importación completada
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {state.result.created}
                  </span>{' '}
                  filas insertadas
                  {state.result.failed > 0 && (
                    <>
                      {' · '}
                      <span className="font-medium text-destructive">
                        {state.result.failed}
                      </span>{' '}
                      con error
                    </>
                  )}
                </p>
              </div>
              {state.result.errorFileBase64 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onDownloadErrors(
                      state.result.errorFileBase64!,
                      'confirm-errores',
                    )
                  }
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Descargar archivo de errores
                </Button>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {state.kind === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold tracking-tight text-destructive">
                  No pudimos procesar el archivo
                </p>
                <p className="text-xs text-muted-foreground">{state.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="border-t border-border/70 bg-muted/15 px-6 py-3.5 sm:gap-2">
          {state.kind === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button disabled>
                <Upload className="mr-1.5 h-4 w-4" />
                Subir y previsualizar
              </Button>
            </>
          )}

          {state.kind === 'selecting' && (
            <>
              <Button variant="outline" onClick={onReset}>
                Cambiar archivo
              </Button>
              <Button onClick={onPreview}>
                <Upload className="mr-1.5 h-4 w-4" />
                Subir y previsualizar
              </Button>
            </>
          )}

          {state.kind === 'previewing' && (
            <Button variant="outline" disabled>
              Procesando...
            </Button>
          )}

          {state.kind === 'preview-result' && (
            <>
              <Button variant="outline" onClick={onReset}>
                Cancelar
              </Button>
              <Button
                onClick={onConfirm}
                disabled={state.preview.validCount === 0}
              >
                <Check className="mr-1.5 h-4 w-4" />
                Importar {state.preview.validCount} filas válidas
              </Button>
            </>
          )}

          {state.kind === 'confirming' && (
            <Button disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Importando...
            </Button>
          )}

          {state.kind === 'done' && <Button onClick={onClose}>Cerrar</Button>}

          {state.kind === 'error' && (
            <Button variant="outline" onClick={onReset}>
              Reintentar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
