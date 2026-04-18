import '@testing-library/jest-dom';
import { vi } from 'vitest';

// --- next/navigation ---------------------------------------------------------
vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
  return {
    useRouter: vi.fn(() => router),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
    useParams: vi.fn(() => ({})),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

// --- next/headers ------------------------------------------------------------
vi.mock('next/headers', () => {
  const makeStore = () => {
    const map = new Map<string, string>();
    return {
      get: (name: string) =>
        map.has(name) ? { name, value: map.get(name)! } : undefined,
      getAll: () =>
        Array.from(map.entries()).map(([name, value]) => ({ name, value })),
      has: (name: string) => map.has(name),
      set: (name: string, value: string) => {
        map.set(name, value);
      },
      delete: (name: string) => {
        map.delete(name);
      },
    };
  };
  return {
    cookies: vi.fn(async () => makeStore()),
    headers: vi.fn(async () => makeStore()),
  };
});

// --- next-auth ---------------------------------------------------------------
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    auth: vi.fn(async () => null),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  })),
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// --- html5-qrcode ------------------------------------------------------------
vi.mock('html5-qrcode', () => {
  class Html5Qrcode {
    start = vi.fn(async () => undefined);
    stop = vi.fn(async () => undefined);
    clear = vi.fn();
  }
  class Html5QrcodeScanner {
    render = vi.fn();
    clear = vi.fn();
  }
  return { Html5Qrcode, Html5QrcodeScanner };
});

// --- @react-pdf/renderer -----------------------------------------------------
vi.mock('@react-pdf/renderer', () => {
  return {
    Document: () => null,
    Page: () => null,
    Text: () => null,
    View: () => null,
    Image: () => null,
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
    Font: { register: vi.fn() },
    PDFDownloadLink: () => null,
    pdf: vi.fn(() => ({ toBlob: vi.fn(async () => new Blob()) })),
  };
});
