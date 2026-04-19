import { describe, it, expect, beforeEach } from 'vitest';
import { validateAppUrl } from '../validateAppUrl';

const APP_URL = 'https://inventory.novahold.com';

describe('validateAppUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  });

  it('returns the asset path for a valid app QR URL', () => {
    const result = validateAppUrl(`${APP_URL}/assets/NVH-PC-00001`);
    expect(result).toBe('/assets/NVH-PC-00001');
  });

  it('returns the asset path for a different asset code', () => {
    const result = validateAppUrl(`${APP_URL}/assets/NVH-MON-00042`);
    expect(result).toBe('/assets/NVH-MON-00042');
  });

  it('returns null for a URL from another domain', () => {
    const result = validateAppUrl('https://malicious.com/assets/NVH-PC-00001');
    expect(result).toBeNull();
  });

  it('returns null for a non-asset path of the same app', () => {
    const result = validateAppUrl(`${APP_URL}/employees/123`);
    expect(result).toBeNull();
  });

  it('returns null for a plain string that is not a URL', () => {
    const result = validateAppUrl('NVH-PC-00001');
    expect(result).toBeNull();
  });
});
