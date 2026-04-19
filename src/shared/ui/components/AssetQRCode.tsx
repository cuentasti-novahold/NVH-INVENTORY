'use client';

import { useEffect, useState } from 'react';

interface AssetQRCodeProps {
  assetCode: string;
  size?: number;
}

export function AssetQRCode({ assetCode, size = 200 }: AssetQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const url = `${appUrl}/assets/${assetCode}`;
    import('qrcode').then(({ default: QRCode }) => {
      QRCode.toDataURL(url, { width: size, margin: 1 }).then(setDataUrl);
    });
  }, [assetCode, size]);

  if (!dataUrl) return <div style={{ width: size, height: size }} className="bg-muted animate-pulse rounded" />;

  return (
    <img
      src={dataUrl}
      alt={`Código QR ${assetCode}`}
      width={size}
      height={size}
      className="rounded border"
    />
  );
}
