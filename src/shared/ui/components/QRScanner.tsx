'use client';

/**
 * QRScanner — wraps html5-qrcode. Must be imported via next/dynamic with
 * ssr: false because html5-qrcode accesses window/navigator.
 *
 * Example:
 *   const QRScanner = dynamic(
 *     () => import('@/shared/ui/components/QRScanner').then(m => m.QRScanner),
 *     { ssr: false },
 *   );
 */

import { useEffect, useId, useRef } from 'react';

export interface QRScannerProps {
  onDecode: (value: string) => void;
  onError?: (err: Error) => void;
  paused?: boolean;
  fps?: number;
  qrboxSize?: number;
}

export function QRScanner({
  onDecode,
  onError,
  paused = false,
  fps = 10,
  qrboxSize = 240,
}: QRScannerProps) {
  const containerId = useId().replaceAll(':', '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let destroyed = false;

    async function start() {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (destroyed) return;

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps, qrbox: qrboxSize },
          (decodedText: string) => {
            if (!pausedRef.current) onDecode(decodedText);
          },
          (errorMessage: string) => onError?.(new Error(errorMessage)),
        );
      } catch (err) {
        if (!destroyed) onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }

    start();

    return () => {
      destroyed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        Promise.resolve()
          .then(() => scanner.isScanning ? scanner.stop() : Promise.resolve())
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div id={containerId} className="w-full" />;
}
