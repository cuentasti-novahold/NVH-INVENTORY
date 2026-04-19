import { differenceInYears } from 'date-fns';

export interface DepreciationResult {
  annualDepr: number;
  accumulated: number;
  bookValue: number;
  yearsElapsed: number;
}

export function calculateDepreciation(
  purchasePriceBase: number,
  salvageValue: number,
  usefulLifeYears: number,
  purchaseDate: Date | null,
  asDate?: Date,
): DepreciationResult {
  if (!purchaseDate) {
    return { annualDepr: 0, accumulated: 0, bookValue: purchasePriceBase, yearsElapsed: 0 };
  }
  const ref = asDate ?? new Date();
  const yearsElapsed = Math.max(0, differenceInYears(ref, purchaseDate));
  const maxDepr = purchasePriceBase - salvageValue;
  const annualDepr = usefulLifeYears > 0 ? maxDepr / usefulLifeYears : 0;
  const accumulated = Math.min(annualDepr * yearsElapsed, maxDepr);
  const bookValue = purchasePriceBase - accumulated;
  return { annualDepr, accumulated, bookValue, yearsElapsed };
}
