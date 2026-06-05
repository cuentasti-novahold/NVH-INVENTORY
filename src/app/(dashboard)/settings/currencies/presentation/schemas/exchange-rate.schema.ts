import * as yup from 'yup';

export const exchangeRateCreateSchema = yup.object({
  currencyId:    yup.string().trim().required('Moneda requerida'),
  rateToBase:    yup.string().trim().matches(/^\d+(\.\d{1,6})?$/, 'Número con hasta 6 decimales').required('Tasa requerida'),
  effectiveDate: yup.string().trim().required('Fecha requerida'),
  source:        yup.string().trim().max(120).nullable().optional(),
});

// NO update schema — ExchangeRate es inmutable
