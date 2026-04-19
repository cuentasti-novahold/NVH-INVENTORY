import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockToDataURL = vi.fn();

vi.mock('qrcode', () => ({
  default: { toDataURL: mockToDataURL },
}));

import { AssetQRCode } from '../AssetQRCode';

const APP_URL = 'https://inventory.novahold.com';

describe('AssetQRCode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    mockToDataURL.mockClear();
    mockToDataURL.mockResolvedValue('data:image/png;base64,TESTQR');
  });

  it('renders an img with the generated QR data URL', async () => {
    render(<AssetQRCode assetCode="NVH-PC-00001" />);
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,TESTQR');
  });

  it('passes the full asset URL to QRCode.toDataURL', async () => {
    render(<AssetQRCode assetCode="NVH-MON-00005" />);
    await waitFor(() => expect(mockToDataURL).toHaveBeenCalled());
    const calledUrl = mockToDataURL.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(`${APP_URL}/assets/NVH-MON-00005`);
  });
});
