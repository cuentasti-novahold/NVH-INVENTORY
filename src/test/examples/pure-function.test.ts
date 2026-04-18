// @vitest-environment node

/**
 * Example: pure-function unit test.
 * Pattern: domain/application layer — no DOM, no React.
 * Copy this structure for tests under src/modules/<m>/domain/**
 * and src/modules/<m>/application/**.
 */

function formatAssetCode(prefix: string, sequence: number): string {
  const padded = sequence.toString().padStart(5, '0');
  return `NVH-${prefix}-${padded}`;
}

describe('formatAssetCode', () => {
  it('formats a small sequence with zero-padding', () => {
    expect(formatAssetCode('PC', 1)).toBe('NVH-PC-00001');
  });

  it('handles a mid-range sequence', () => {
    expect(formatAssetCode('MON', 42)).toBe('NVH-MON-00042');
  });

  it('preserves width when sequence already has five digits', () => {
    expect(formatAssetCode('PHN', 99999)).toBe('NVH-PHN-99999');
  });
});
