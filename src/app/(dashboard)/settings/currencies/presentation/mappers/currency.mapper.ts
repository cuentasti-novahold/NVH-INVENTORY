import type { CurrencyRow } from '../dto/currency.dto';

type CurrencyWithRelations = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  _count: { assets: number; exchangeRates: number };
};

export const currencyInclude = {
  _count: { select: { assets: true, exchangeRates: true } },
} as const;

export function toCurrencyRow(c: CurrencyWithRelations): CurrencyRow {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    isBase: c.isBase,
    assetsCount: c._count.assets,
    ratesCount: c._count.exchangeRates,
  };
}
