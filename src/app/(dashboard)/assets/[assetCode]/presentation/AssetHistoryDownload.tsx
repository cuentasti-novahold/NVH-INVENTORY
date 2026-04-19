'use client';

import { useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import { AssetHistoryPDF } from '@/shared/ui/components/AssetHistoryPDF';
import { getAssetHistoryAction } from '../../actions';

interface AssetHistoryDownloadProps {
  assetCode: string;
  onDone: () => void;
}

export function AssetHistoryDownload({ assetCode, onDone }: AssetHistoryDownloadProps) {
  useEffect(() => {
    async function download() {
      const result = await getAssetHistoryAction(assetCode);
      if (!result.ok) {
        toast.error('Error al obtener historial');
        onDone();
        return;
      }

      const blob = await pdf(<AssetHistoryPDF data={result.data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historial-${assetCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onDone();
    }

    download();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
