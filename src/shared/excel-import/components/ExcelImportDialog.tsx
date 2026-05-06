'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  previewImportAction,
  confirmImportAction,
  getImportTemplateAction,
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

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ERRORS_SHOWN = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix — actions expect raw base64
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset to idle every time the dialog opens
  useEffect(() => {
    if (open) {
      setState({ kind: 'idle' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  // ─── File selection ─────────────────────────────────────────────────────

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side extension check
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Solo se aceptan archivos .xlsx');
      e.target.value = '';
      return;
    }

    // Client-side size check
    if (file.size > MAX_FILE_BYTES) {
      toast.error('El archivo supera el límite de 10 MB');
      e.target.value = '';
      return;
    }

    setState({ kind: 'selecting', file });
  }

  // ─── Template download ──────────────────────────────────────────────────

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

  // ─── Error file download ─────────────────────────────────────────────────

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

  // ─── Close after done ────────────────────────────────────────────────────

  function onClose() {
    onSuccess?.();
    onOpenChange(false);
  }

  // ─── Reset to idle ───────────────────────────────────────────────────────

  function onReset() {
    setState({ kind: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* ── idle ── */}
        {state.kind === 'idle' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-3">
              <Label htmlFor="excel-file-v2" className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Seleccionar archivo Excel
              </Label>
              <Input
                ref={fileInputRef}
                id="excel-file-v2"
                type="file"
                accept=".xlsx"
                onChange={onFileChange}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onDownloadTemplate}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar template
            </Button>
          </div>
        )}

        {/* ── selecting ── */}
        {state.kind === 'selecting' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate text-foreground">{state.file.name}</span>
            </div>
          </div>
        )}

        {/* ── previewing ── */}
        {state.kind === 'previewing' && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Procesando archivo...
          </div>
        )}

        {/* ── preview-result ── */}
        {state.kind === 'preview-result' && (
          <div className="flex flex-col gap-4 py-2">
            {/* Summary banner */}
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Filas válidas: {state.preview.validCount}
              </div>
              {state.preview.errorCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Filas con error: {state.preview.errorCount}
                </div>
              )}
            </div>

            {/* First N errors */}
            {state.preview.errors.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs font-semibold text-destructive">
                  {state.preview.errors.length > MAX_ERRORS_SHOWN
                    ? `Primeros ${MAX_ERRORS_SHOWN} errores (hay ${state.preview.errors.length} en total):`
                    : `Errores (${state.preview.errors.length}):`}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {state.preview.errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
                    <li key={i} className="text-xs text-destructive">
                      Fila {e.row}
                      {e.field ? ` · ${e.field}` : ''}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error file download */}
            {state.preview.errorFileBase64 && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => onDownloadErrors(state.preview.errorFileBase64!)}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar archivo de errores
              </Button>
            )}
          </div>
        )}

        {/* ── confirming ── */}
        {state.kind === 'confirming' && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importando...
          </div>
        )}

        {/* ── done ── */}
        {state.kind === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="font-medium">Importación completada</p>
            <div className="flex gap-4 text-muted-foreground">
              <span className="text-emerald-600">
                Filas insertadas: {state.result.created}
              </span>
              {state.result.failed > 0 && (
                <span className="text-destructive">
                  Filas con error: {state.result.failed}
                </span>
              )}
            </div>
            {state.result.errorFileBase64 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownloadErrors(state.result.errorFileBase64!, 'confirm-errores')}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar archivo de errores
              </Button>
            )}
          </div>
        )}

        {/* ── error ── */}
        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-medium text-destructive">Error</p>
            <p className="text-center text-muted-foreground">{state.message}</p>
          </div>
        )}

        {/* ── Footer ── */}
        <DialogFooter>
          {state.kind === 'idle' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}

          {state.kind === 'selecting' && (
            <>
              <Button variant="outline" onClick={onReset}>
                Cambiar archivo
              </Button>
              <Button onClick={onPreview}>Previsualizar</Button>
            </>
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
                Importar {state.preview.validCount} filas válidas
              </Button>
            </>
          )}

          {state.kind === 'done' && (
            <Button onClick={onClose}>Cerrar</Button>
          )}

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
