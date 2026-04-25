'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/shared/types/action-result';

interface ExcelExportButtonProps {
  label: string;
  action: () => Promise<ActionResult<{ base64: string; filename: string }>>;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  className?: string;
}

export function ExcelExportButton({ label, action, variant = 'outline', className }: ExcelExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await action();
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
    } catch {
      toast.error('Error al exportar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      className={cn('gap-1.5', className)}
      onClick={handleClick}
      disabled={loading}
    >
      <Download className="h-4 w-4" />
      {loading ? 'Exportando…' : label}
    </Button>
  );
}
