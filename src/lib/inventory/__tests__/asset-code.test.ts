// @vitest-environment node
import { describe, it, expect } from 'vitest';

// RED phase: import from a file that does not exist yet — tests must fail.
import { formatAssetCode } from '../asset-code';

describe('formatAssetCode', () => {
  it('formats ARCHA-PC-00001 for sequence 1', () => {
    expect(formatAssetCode('ARCHA', 'PC', 1)).toBe('ARCHA-PC-00001');
  });

  it('pads sequence to 5 digits', () => {
    expect(formatAssetCode('NVH', 'LAP', 7)).toBe('NVH-LAP-00007');
  });

  it('handles max 5-digit sequence NVH-LAP-99999', () => {
    expect(formatAssetCode('NVH', 'LAP', 99999)).toBe('NVH-LAP-99999');
  });

  it('uses company code — not hardcoded NVH', () => {
    expect(formatAssetCode('ARCHA', 'PC', 1)).not.toContain('NVH');
  });

  it('uses category prefix correctly', () => {
    expect(formatAssetCode('NVH', 'MON', 42)).toBe('NVH-MON-00042');
  });
});
