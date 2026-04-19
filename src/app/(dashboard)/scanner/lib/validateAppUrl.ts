export function validateAppUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/assets/')) return null;

    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    const expectedOrigin = configuredUrl
      ? new URL(configuredUrl).origin
      : typeof window !== 'undefined'
        ? window.location.origin
        : null;

    if (expectedOrigin && parsed.origin !== expectedOrigin) return null;

    return parsed.pathname;
  } catch {
    return null;
  }
}
