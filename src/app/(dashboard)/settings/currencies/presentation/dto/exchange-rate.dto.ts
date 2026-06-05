export interface ExchangeRateRow {
  id: string;
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  rateToBase: string;       // Decimal → string SIEMPRE
  effectiveDate: string;    // ISO string
  source: string | null;
}

export interface CreateExchangeRateDTO {
  currencyId: string;
  rateToBase: string;       // viene como string desde RHF; Prisma acepta string en Decimal
  effectiveDate: string;
  source?: string | null;
}

// NO UpdateExchangeRateDTO — ExchangeRate es historial inmutable
