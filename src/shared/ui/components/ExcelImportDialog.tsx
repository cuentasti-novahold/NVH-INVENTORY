'use client';

import { useEffect, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
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
import type {
  ExcelImportState,
  ExcelImportResult,
} from '@/shared/ui/types/excel-import.types';

export interface ExcelImportDialogProps<TRow> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  expectedColumns?: ReadonlyArray<string>;
  action: (rows: TRow[]) => Promise<ExcelImportResult>;
  parseRow?: (raw: Record<string, unknown>) => TRow;
  onSuccess?: (result: ExcelImportResult) => void;
}

export function ExcelImportDialog<TRow>({
  open,
  onOpenChange,
  title,
  description,
  expectedColumns,
  action,
  parseRow,
  onSuccess,
}: ExcelImportDialogProps<TRow>) {
  const [state, setState] = useState<ExcelImportState>('idle');
  const [rows, setRows] = useState<TRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExcelImportResult | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setState('idle');
      setRows([]);
      setFileName(null);
      setError(null);
      setResult(null);
      setMissingColumns([]);
    }
  }, [open]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFileName(file.name);
      const xlsx = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const parsed = parseRow ? raw.map(parseRow) : (raw as unknown as TRow[]);
      if (expectedColumns && raw.length > 0) {
        const keys = Object.keys(raw[0]!);
        const missing = expectedColumns.filter((col) => !keys.includes(col));
        setMissingColumns(missing);
      } else {
        setMissingColumns([]);
      }
      setRows(parsed);
      setState('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo');
      setState('error');
    }
  }

  async function onSubmit() {
    setState('uploading');
    try {
      const res = await action(rows);
      setResult(res);
      setState('done');
      onSuccess?.(res);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
      setState('error');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? 'Importar desde Excel'}</DialogTitle>
          <DialogDescription>
            {description ?? 'Seleccioná un archivo .xlsx para previsualizar e importar.'}
          </DialogDescription>
        </DialogHeader>

        {state === 'idle' && (
          <div className="flex flex-col gap-3 py-6">
            <Label htmlFor="excel-file" className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Archivo Excel (.xlsx)
            </Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
            />
          </div>
        )}

        {state === 'preview' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{fileName}</span>
              <span>·</span>
              <span>{rows.length} filas</span>
            </div>
            {missingColumns.length > 0 && (
              <div className="flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Columnas faltantes: {missingColumns.join(', ')}</span>
              </div>
            )}
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {rows[0] &&
                      Object.keys(rows[0] as object).map((k) => (
                        <th key={k} className="px-2 py-1 text-left font-medium">
                          {k}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {Object.values(r as object).map((v, j) => (
                        <td key={j} className="px-2 py-1">
                          {String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {state === 'uploading' && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Importando…
          </div>
        )}

        {state === 'done' && result && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="font-medium">Importación completada</p>
            <p className="text-muted-foreground">
              {result.inserted} insertadas · {result.skipped} omitidas
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-medium">Error</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
        )}

        <DialogFooter>
          {state === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => { setState('idle'); setRows([]); setFileName(null); setMissingColumns([]); }}
              >
                Cancelar
              </Button>
              <Button onClick={onSubmit} disabled={missingColumns.length > 0}>
                Importar {rows.length} filas
              </Button>
            </>
          )}
          {(state === 'done' || state === 'error') && (
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
