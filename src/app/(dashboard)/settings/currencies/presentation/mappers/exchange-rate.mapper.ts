import type { ExchangeRateRow } from '../dto/exchange-rate.dto';

type ExchangeRateWithRelations = {
  id: string;
  currencyId: string;
  rateToBase: { toString(): string };   // Prisma Decimal
  effectiveDate: Date;
  source: string | null;
  currency: { code: string; name: string; symbol: string };
};

export const exchangeRateInclude = {
  currency: { select: { code: true, name: true, symbol: true } },
} as const;

export function toExchangeRateRow(r: ExchangeRateWithRelations): ExchangeRateRow {
  return {
    id: r.id,
    currencyId: r.currencyId,
    currencyCode: r.currency.code,
    currencyName: r.currency.name,
    rateToBase: r.rateToBase.toString(),   // NUNCA Number() ni parseFloat()
    effectiveDate: r.effectiveDate.toISOString(),
    source: r.source,
  };
}
