# Tasks: Módulo Gestión de Monedas (`currency-management`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (infra + actions) → PR 2 (UI completa) → PR 3 (fix asset-form) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Permisos + sidebar + DTOs + mappers + schemas + actions + tests | PR 1 | Base para todo lo demás; sin dependencias externas nuevas |
| 2 | Hooks + forms + columns + TablePages + Tabs + page.tsx | PR 2 | Requiere PR 1 mergeado; UI completa |
| 3 | Fix `asset-form.config.ts` — reemplazar select hardcodeado | PR 3 | Requiere PR 1 mergeado (import directo de actions); independiente de PR 2 |

---

## Phase 1: Foundation — Permisos, sidebar y seed SQL

- [ ] 1.1 `src/lib/permissions.ts` — agregar `'currencies'` al type `Resource`; añadir `'currencies:*'` a `ADMIN`; añadir `'currencies:read'` a `MANAGER`, `TECHNICIAN` y `VIEWER`
- [ ] 1.2 `src/components/dashboard/sidebar-nav-config.ts` — agregar import `Coins` de lucide-react; añadir ítem `{ href: '/settings/currencies', label: 'Monedas', icon: Coins }` en sección `CATÁLOGOS` después de Ubicaciones
- [ ] 1.3 `scripts/sql/seed-currencies.sql` — crear script con `INSERT … ON DUPLICATE KEY UPDATE` para COP (isBase=1), USD, EUR; el UPDATE no debe pisar `isBase`

---

## Phase 2: DTOs, mappers y schemas

- [ ] 2.1 `src/app/(dashboard)/settings/currencies/presentation/dto/currency.dto.ts` — definir `CurrencyRow`, `CreateCurrencyDTO`, `UpdateCurrencyDTO` (Partial)
- [ ] 2.2 `src/app/(dashboard)/settings/currencies/presentation/dto/exchange-rate.dto.ts` — definir `ExchangeRateRow` (`rateToBase: string`), `CreateExchangeRateDTO`; NO `UpdateExchangeRateDTO`
- [ ] 2.3 `src/app/(dashboard)/settings/currencies/presentation/mappers/currency.mapper.ts` — `toCurrencyRow` con tipo `CurrencyWithRelations` (incluye `_count.assets` y `_count.exchangeRates`)
- [ ] 2.4 `src/app/(dashboard)/settings/currencies/presentation/mappers/exchange-rate.mapper.ts` — `toExchangeRateRow` con `rateToBase.toString()` (Decimal → string, nunca `Number()`)
- [ ] 2.5 `src/app/(dashboard)/settings/currencies/presentation/schemas/currency.schema.ts` — `currencyCreateSchema` (code: uppercase 3 letras, name max 60, symbol max 5, isBase boolean); `currencyUpdateSchema = currencyCreateSchema.partial()`
- [ ] 2.6 `src/app/(dashboard)/settings/currencies/presentation/schemas/exchange-rate.schema.ts` — `exchangeRateCreateSchema` (currencyId required, rateToBase como string con regex `/^\d+(\.\d{1,6})?$/`, effectiveDate, source opcional); NO update schema

---

## Phase 3: Server Actions

- [ ] 3.1 `src/app/(dashboard)/settings/currencies/actions.ts` — `'use server'`; implementar `listCurrenciesAction` con paginación cursor, paramPrefix-aware, `currencyInclude`, `$transaction([findMany, count])`
- [ ] 3.2 — en el mismo `actions.ts`: `createCurrencyAction` con `$transaction` que hace `updateMany({ isBase:true })` → create; validación Yup; `isP2002` en catch
- [ ] 3.3 — en el mismo `actions.ts`: `updateCurrencyAction` con `$transaction` que hace `updateMany({ isBase:true, NOT: {id} })` antes de update; `isP2025` + `isP2002` en catch
- [ ] 3.4 — en el mismo `actions.ts`: `deleteCurrencyAction` con check previo `_count` (base protegida, assets>0, rates>0) + try/catch `isP2003` como respaldo
- [ ] 3.5 — en el mismo `actions.ts`: `searchCurrenciesAction(q)` — devuelve `{ code: r.code, value: \`${r.code} — ${r.name}\` }`; where undefined si q vacío; take 20; `auth()` guard
- [ ] 3.6 — en el mismo `actions.ts`: `searchCurrenciesByIdAction(q)` — devuelve `{ code: r.id, value: \`${r.code} — ${r.name}\` }`; misma query que 3.5 pero `code: r.id` (para FK `ExchangeRate.currencyId`)
- [ ] 3.7 — en el mismo `actions.ts`: `listExchangeRatesAction` con paginación cursor, `exchangeRateInclude`, q opcional sobre `currency.code`
- [ ] 3.8 — en el mismo `actions.ts`: `createExchangeRateAction` con validación Yup; `rateToBase` se pasa como string a Prisma (no `parseFloat`); `effectiveDate: new Date(dto.effectiveDate)`; `isP2025` en catch

---

## Phase 4: Hooks

- [ ] 4.1 `src/app/(dashboard)/settings/currencies/presentation/hooks/use-currencies.ts` — `useTransition`, toast, `fieldErrors`; exponer `create`, `update`, `remove`; patrón `use-countries`
- [ ] 4.2 `src/app/(dashboard)/settings/currencies/presentation/hooks/use-exchange-rates.ts` — `useTransition`, toast, `fieldErrors`; exponer SOLO `create` (sin update ni remove, schema inmutable)

---

## Phase 5: Forms y columns (paralelos entre sí, dependen de 2.x y 3.x)

- [ ] 5.1 `src/app/(dashboard)/settings/currencies/presentation/forms/currency-form.config.ts` — `FormConfig` con fields: `code` (text, pattern ISO-4217), `symbol` (text), `name` (text), `isBase` (switch)
- [ ] 5.2 `src/app/(dashboard)/settings/currencies/presentation/forms/exchange-rate-form.config.ts` — `FormConfig` con `currencyId` (autocomplete, `searchCurrenciesByIdAction`, `returnMode:'code'`), `rateToBase` (number), `effectiveDate` (date), `source` (text opcional)
- [ ] 5.3 `src/app/(dashboard)/settings/currencies/presentation/components/columns-currencies.tsx` — `'use client'`; columnas: code, name, symbol, isBase (badge), ratesCount, assetsCount; SIN columna acciones (va inline en TablePage)
- [ ] 5.4 `src/app/(dashboard)/settings/currencies/presentation/components/columns-exchange-rates.tsx` — `'use client'`; columnas: currencyCode, rateToBase, effectiveDate, source; SIN columna acciones (create-only, no hay edit/delete)

---

## Phase 6: TablePages, Tabs y page.tsx

- [ ] 6.1 `src/app/(dashboard)/settings/currencies/presentation/components/CurrenciesTablePage.tsx` — `'use client'`; CRUD completo; `paramPrefix="monedas"`; acciones inline; `CrudFormDialog` create + edit; dialog cierra en `onSuccess`; `defaultValues=editing` (no factory)
- [ ] 6.2 `src/app/(dashboard)/settings/currencies/presentation/components/ExchangeRatesTablePage.tsx` — `'use client'`; CREATE-only (sin botón edit ni delete en columnas); `paramPrefix="tasas"`; `CrudFormDialog` create; dialog cierra en `onSuccess`
- [ ] 6.3 `src/app/(dashboard)/settings/currencies/presentation/components/CurrenciesTabs.tsx` — `'use client'`; `Tabs` shadcn URL-driven (`?tab=monedas|tasas`); `useTransition` + `router.replace({scroll:false})`; tab default `'monedas'`; recibe `currencies`, `exchangeRates`, `canWrite`, props de paginación prefijadas
- [ ] 6.4 `src/app/(dashboard)/settings/currencies/page.tsx` — Server Component; `auth()` + `hasPermission('currencies','read')`; `Promise.all([listCurrenciesAction(...), listExchangeRatesAction(...)])`; render `<CurrenciesTabs>`; SIN `'use client'`

---

## Phase 7: Fix asset-form (depende de Phase 3 — requiere `searchCurrenciesAction` disponible)

- [ ] 7.1 `src/app/(dashboard)/assets/presentation/forms/asset-form.config.ts` — reemplazar bloque `type:'select'` del campo `currencyCode` (líneas 244-254) por `type:'autocomplete'` con `searchCurrenciesAction`, `returnMode:'code'`, `minChars:0`, `initialDisplayValue`; agregar import de `searchCurrenciesAction`

---

## Phase 8: Tests

- [ ] 8.1 `src/app/(dashboard)/settings/currencies/__tests__/actions.test.ts` — test: `createCurrencyAction` con `isBase:true` desmarca la anterior (verifica que `$transaction` llama `updateMany`); mock de `prisma.$transaction`
- [ ] 8.2 — en el mismo test file: `deleteCurrencyAction` con moneda base retorna `CONFLICT`; con `_count.assets > 0` retorna `HAS_CHILDREN`; con `_count.exchangeRates > 0` retorna `HAS_CHILDREN`; catch `P2003` retorna `HAS_CHILDREN`
- [ ] 8.3 — en el mismo test file: `createExchangeRateAction` — `rateToBase` llega como string y se pasa a Prisma sin `parseFloat`; `isP2025` retorna `NOT_FOUND`
- [ ] 8.4 — en el mismo test file: `searchCurrenciesAction` — query vacía devuelve hasta 20 sin filtro; query con texto filtra por code/name; shape `{ code: r.code, value }` correcto
- [ ] 8.5 — en el mismo test file: `searchCurrenciesByIdAction` — shape `{ code: r.id, value }` correcto (distinto de searchCurrenciesAction)
