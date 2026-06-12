import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Shared spy functions for QRScanner mock
const mockStart = vi.fn();
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockClear = vi.fn().mockResolvedValue(undefined);

// The QRScanner component uses Html5Qrcode (not Html5QrcodeScanner) with start/stop/clear
vi.mock('html5-qrcode', () => {
  class Html5Qrcode {
    isScanning = true;
    start = mockStart;
    stop = mockStop;
    clear = mockClear;
  }
  return { Html5Qrcode };
});

import { QRScanner } from '../QRScanner';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('QRScanner', () => {
  beforeEach(() => {
    mockStart.mockClear();
    mockStop.mockClear();
    mockClear.mockClear();
    // Default: start resolves immediately
    mockStart.mockResolvedValue(undefined);
  });

  it('renders a div container', async () => {
    const onDecode = vi.fn();
    const { container } = render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    const div = container.querySelector('div');
    expect(div).toBeInTheDocument();
  });

  it('initializes scanner after mount and calls start', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('calls onDecode when the QR callback fires', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });

    // The third arg to start() is the onSuccess callback
    const [, , onSuccess] = mockStart.mock.calls[0] as [unknown, unknown, Function, Function];
    act(() => { onSuccess('qr-value-123'); });
    expect(onDecode).toHaveBeenCalledWith('qr-value-123');
  });

  it('calls stop() and clear() on unmount', async () => {
    const onDecode = vi.fn();
    const { unmount } = render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    unmount();
    await act(async () => { await flushPromises(); });
    // The cleanup calls scanner.stop() then scanner.clear()
    expect(mockStop).toHaveBeenCalled();
  });

  it('does not call onDecode when paused prop is true', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} paused={true} />);
    await act(async () => { await flushPromises(); });

    const [, , onSuccess] = mockStart.mock.calls[0] as [unknown, unknown, Function, Function];
    act(() => { onSuccess('qr-value-123'); });
    // pausedRef guards the callback — onDecode should NOT be called when paused
    expect(onDecode).not.toHaveBeenCalled();
  });

  it('calls onDecode when paused prop is false', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} paused={false} />);
    await act(async () => { await flushPromises(); });

    const [, , onSuccess] = mockStart.mock.calls[0] as [unknown, unknown, Function, Function];
    act(() => { onSuccess('qr-value-123'); });
    expect(onDecode).toHaveBeenCalledWith('qr-value-123');
  });
});
