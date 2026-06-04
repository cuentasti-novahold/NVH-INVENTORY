'use client';

import { useEffect, useRef } from 'react';
import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import { EmployeeAssignmentPDF } from '@/shared/ui/components/EmployeeAssignmentPDF';
import { getEmployeeAssignmentReportAction } from '../../actions';

interface Props {
  employeeId: string;
  onDone: () => void;
}

export function EmployeeActaDownload({ employeeId, onDone }: Props) {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    async function download() {
      const result = await getEmployeeAssignmentReportAction(employeeId);
      if (!result.ok) {
        toast.error('Error al generar el acta de asignación');
        onDone();
        return;
      }
      if (result.data.assignments.length === 0) {
        toast.error('Este empleado no tiene asignaciones activas');
        onDone();
        return;
      }
      const blob = await pdf(<EmployeeAssignmentPDF data={result.data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acta-asignacion-${employeeId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onDone();
    }
    download();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
