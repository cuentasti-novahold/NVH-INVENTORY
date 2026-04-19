// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calculateDepreciation } from '../depreciation';

describe('calculateDepreciation', () => {
  const purchaseDate = new Date('2022-01-15');

  it('calculates correct values after 2 years', () => {
    const result = calculateDepreciation(5_000_000, 500_000, 5, purchaseDate, new Date('2024-01-15'));
    // annualDepr = (5_000_000 - 500_000) / 5 = 900_000
    // accumulated = min(900_000 * 2, 4_500_000) = 1_800_000
    // bookValue = 5_000_000 - 1_800_000 = 3_200_000
    expect(result.annualDepr).toBe(900_000);
    expect(result.accumulated).toBe(1_800_000);
    expect(result.bookValue).toBe(3_200_000);
    expect(result.yearsElapsed).toBe(2);
  });

  it('returns zero depreciation when purchaseDate is null', () => {
    const result = calculateDepreciation(5_000_000, 500_000, 5, null, new Date('2024-01-15'));
    expect(result.accumulated).toBe(0);
    expect(result.bookValue).toBe(5_000_000);
    expect(result.yearsElapsed).toBe(0);
    expect(result.annualDepr).toBe(0);
  });

  it('caps accumulated at (purchasePriceBase - salvageValue) when fully depreciated', () => {
    // 10 years elapsed on a 3-year useful life
    const result = calculateDepreciation(5_000_000, 500_000, 3, purchaseDate, new Date('2032-01-15'));
    expect(result.accumulated).toBe(4_500_000);
    expect(result.bookValue).toBe(500_000);
  });

  it('bookValue is non-negative when salvageValue is 0', () => {
    const result = calculateDepreciation(3_000_000, 0, 2, purchaseDate, new Date('2030-01-15'));
    expect(result.bookValue).toBeGreaterThanOrEqual(0);
    expect(result.accumulated).toBeLessThanOrEqual(3_000_000);
  });
});
