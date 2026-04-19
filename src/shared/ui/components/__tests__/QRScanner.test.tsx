import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Shared spy functions for QRScanner mock
const mockRender = vi.fn();
const mockClear = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();
const mockResume = vi.fn();

// Must mock html5-qrcode locally to intercept the dynamic import inside QRScanner
vi.mock('html5-qrcode', () => {
  class Html5QrcodeScanner {
    render = mockRender;
    clear = mockClear;
    pause = mockPause;
    resume = mockResume;
  }
  return { Html5QrcodeScanner };
});

import { QRScanner } from '../QRScanner';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('QRScanner', () => {
  beforeEach(() => {
    mockRender.mockClear();
    mockClear.mockClear();
    mockPause.mockClear();
    mockResume.mockClear();
  });

  it('renders a div container', async () => {
    const onDecode = vi.fn();
    const { container } = render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    const div = container.querySelector('div');
    expect(div).toBeInTheDocument();
  });

  it('initializes scanner after mount and calls render', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('calls onDecode when the QR callback fires', async () => {
    const onDecode = vi.fn();
    render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });

    // The first arg to render() is onSuccess
    const [onSuccess] = mockRender.mock.calls[0] as [Function, Function];
    act(() => { onSuccess('qr-value-123'); });
    expect(onDecode).toHaveBeenCalledWith('qr-value-123');
  });

  it('calls clear() on unmount', async () => {
    const onDecode = vi.fn();
    const { unmount } = render(<QRScanner onDecode={onDecode} />);
    await act(async () => { await flushPromises(); });
    unmount();
    expect(mockClear).toHaveBeenCalled();
  });

  it('calls pause when paused prop becomes true', async () => {
    const onDecode = vi.fn();
    const { rerender } = render(<QRScanner onDecode={onDecode} paused={false} />);
    await act(async () => { await flushPromises(); });
    rerender(<QRScanner onDecode={onDecode} paused={true} />);
    expect(mockPause).toHaveBeenCalledWith(true);
  });

  it('calls resume when paused prop becomes false', async () => {
    const onDecode = vi.fn();
    const { rerender } = render(<QRScanner onDecode={onDecode} paused={true} />);
    await act(async () => { await flushPromises(); });
    rerender(<QRScanner onDecode={onDecode} paused={false} />);
    expect(mockResume).toHaveBeenCalled();
  });
});
