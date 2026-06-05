export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  assetsCount: number;
  ratesCount: number;
}

export interface CreateCurrencyDTO {
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
}

export type UpdateCurrencyDTO = Partial<CreateCurrencyDTO>;
