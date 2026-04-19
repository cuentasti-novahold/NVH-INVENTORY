'use client';

import { useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { AssetLabel } from '@/shared/ui/components/AssetLabel';

interface AssetLabelDownloadProps {
  assetCode: string;
  brand: string | null;
  model: string | null;
  onDone: () => void;
}

export function AssetLabelDownload({ assetCode, brand, model, onDone }: AssetLabelDownloadProps) {
  useEffect(() => {
    async function download() {
      const QRCode = (await import('qrcode')).default;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const url = `${appUrl}/assets/${assetCode}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 90, margin: 1 });

      const blob = await pdf(
        <AssetLabel
          assetCode={assetCode}
          brand={brand}
          model={model}
          qrDataUrl={qrDataUrl}
        />,
      ).toBlob();

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `etiqueta-${assetCode}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      onDone();
    }

    download();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
