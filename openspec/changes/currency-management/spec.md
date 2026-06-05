# Currency Management Specification

## Purpose

Módulo de gestión de monedas y tasas de cambio en `/settings/currencies` (sección CATÁLOGOS). Provee CRUD de `Currency` con moneda base única, historial inmutable de `ExchangeRate`, RBAC dedicado, link en sidebar, y reemplaza el select hardcodeado de `currencyCode` en el asset form por un autocomplete dinámico.

---

## DTOs

| DTO | Campos |
|-----|--------|
| `CurrencyRow` | `id`, `code`, `name`, `symbol`, `isBase`, `exchangeRatesCount`, `assetsCount`, `createdAt` |
| `CreateCurrencyDTO` | `code` (string ≤10, uppercase), `name` (string ≤100), `symbol` (string ≤10), `isBase` (boolean, default `false`) |
| `UpdateCurrencyDTO` | igual a `CreateCurrencyDTO` |
| `ExchangeRateRow` | `id`, `currencyId`, `currencyCode`, `currencyName`, `rateToBase` (string), `effectiveDate` (ISO string), `source` (string?), `createdAt` |
| `CreateExchangeRateDTO` | `currencyId` (string, required), `rateToBase` (number >0), `effectiveDate` (date string), `source` (string?) |
| `AutocompleteOption` | `code` (string), `value` (string — `` `${code} — ${name}` ``) |

---

## Requirements

### Requirement: CRUD de Currency

El sistema MUST exponer `listCurrenciesAction`, `createCurrencyAction`, `updateCurrencyAction`, `deleteCurrencyAction`.

- `listCurrenciesAction(params)` → `ActionResult<{ items: CurrencyRow[], pageInfo }>` — paginación cursor-based con `paramPrefix: 'monedas_'`.
- `createCurrencyAction(dto)` → `ActionResult<CurrencyRow>` — requiere `currencies:create`.
- `updateCurrencyAction(id, dto)` → `ActionResult<CurrencyRow>` — requiere `currencies:update`.
- `deleteCurrencyAction(id)` → `ActionResult<void>` — requiere `currencies:delete`.

#### Scenario: Crear moneda normal

- GIVEN usuario ADMIN autenticado
- WHEN `createCurrencyAction({ code:'GBP', name:'Libra', symbol:'£', isBase:false })`
- THEN retorna `CurrencyRow` con `isBase: false` y ninguna moneda base cambia

#### Scenario: Crear moneda con isBase true

- GIVEN existe Currency COP con `isBase: true`
- WHEN `createCurrencyAction({ code:'USD', name:'Dólar', symbol:'$', isBase:true })`
- THEN dentro de un `$transaction`: COP.isBase → `false`, USD.isBase → `true`
- AND solo un registro tiene `isBase: true` al finalizar

#### Scenario: Actualizar moneda con isBase true

- GIVEN existen COP (`isBase:true`) y USD (`isBase:false`)
- WHEN `updateCurrencyAction(usdId, { isBase:true, ... })`
- THEN COP.isBase → `false`, USD.isBase → `true` — todo en `$transaction`

#### Scenario: Borrar moneda base activa

- GIVEN Currency COP con `isBase: true`
- WHEN `deleteCurrencyAction(copId)`
- THEN retorna `{ ok: false, error: { code: 'CONFLICT', message: '...' } }`
- AND la moneda NO es eliminada

#### Scenario: Borrar moneda con activos asociados

- GIVEN Currency USD referenciada por al menos un Asset
- WHEN `deleteCurrencyAction(usdId)`
- THEN captura P2003 de Prisma → retorna `{ ok: false, error: { code: 'CONFLICT' } }`

#### Scenario: Acceso sin permisos

- GIVEN usuario con rol VIEWER
- WHEN llama a `createCurrencyAction`, `updateCurrencyAction` o `deleteCurrencyAction`
- THEN retorna `{ ok: false, error: { code: 'FORBIDDEN' } }`

---

### Requirement: Historial inmutable de ExchangeRate

El sistema MUST exponer `listExchangeRatesAction` y `createExchangeRateAction`. MUST NOT exponer ni update ni delete para `ExchangeRate`.

- `listExchangeRatesAction(params)` → `ActionResult<{ items: ExchangeRateRow[], pageInfo }>` — paginación cursor-based con `paramPrefix: 'tasas_'`.
- `createExchangeRateAction(dto)` → `ActionResult<ExchangeRateRow>` — requiere `currencies:create`.
- `rateToBase` MUST ser serializado como `string` (Decimal→string) para preservar precisión.

#### Scenario: Crear tasa de cambio

- GIVEN Currency USD existe
- WHEN `createExchangeRateAction({ currencyId: usdId, rateToBase: 4200.50, effectiveDate: '2026-06-01', source: 'manual' })`
- THEN retorna `ExchangeRateRow` con `rateToBase: '4200.500000'`
- AND el registro persiste sin `updatedAt`

#### Scenario: Tab Tasas de Cambio no ofrece editar ni borrar

- GIVEN usuario ADMIN en `/settings/currencies?tab=tasas`
- WHEN `ExchangeRatesTablePage` renderiza
- THEN no existe botón ni menú de editar ni borrar en ninguna fila

---

### Requirement: Autocomplete dinámico de moneda en Asset Form

El sistema MUST reemplazar el `<select>` hardcodeado de `currencyCode` en `asset-form.config.ts` por un campo `type: 'autocomplete'` que use `searchCurrenciesAction`.

- `searchCurrenciesAction(q: string)` → `ActionResult<AutocompleteOption[]>` — retorna opciones donde `code` es el valor persistido y `value` es el label.
- El campo MUST usar `returnMode: 'code'` y `minChars: 0`.
- El valor por defecto SHOULD ser `'COP'`.

#### Scenario: Asset form muestra monedas dinámicas

- GIVEN existen currencies COP, USD, EUR en base de datos
- WHEN usuario abre el asset form y escribe '' en el campo moneda (minChars 0)
- THEN el autocomplete retorna las tres opciones desde `searchCurrenciesAction`
- AND ninguna opción está hardcodeada en el FormConfig

#### Scenario: Asset form no rompe sin seed

- GIVEN tabla `currencies` vacía
- WHEN usuario abre el asset form
- THEN el campo moneda retorna lista vacía sin error P2003

---

### Requirement: RBAC — Recurso currencies

El sistema MUST agregar `'currencies'` a `permissions.ts` con las siguientes reglas: ADMIN → `currencies:*`, MANAGER / TECHNICIAN / VIEWER → `currencies:read`, SUPER_ADMIN ya cubre `*`.

#### Scenario: MANAGER puede leer pero no crear

- GIVEN usuario con rol MANAGER autenticado
- WHEN llama a `listCurrenciesAction`
- THEN retorna `{ ok: true, data: { items: [...] } }`
- WHEN llama a `createCurrencyAction`
- THEN retorna `{ ok: false, error: { code: 'FORBIDDEN' } }`

---

### Requirement: Link sidebar en CATÁLOGOS

El sistema MUST agregar un ítem "Monedas" (icono `Coins`, ruta `/settings/currencies`) a la sección CATÁLOGOS de `sidebar-nav-config.ts`.

#### Scenario: Sidebar muestra "Monedas"

- GIVEN usuario autenticado
- WHEN navega al dashboard
- THEN el sidebar muestra "Monedas" bajo CATÁLOGOS

---

### Requirement: Script de seed SQL idempotente

El sistema MUST proveer `scripts/sql/seed-currencies.sql` con upsert de COP (isBase=1), USD, EUR. El upsert NO MUST pisar `isBase` en el UPDATE si ya existe la fila.

#### Scenario: Seed idempotente

- GIVEN se ejecuta el script dos veces seguidas
- WHEN segunda ejecución
- THEN no hay error y los datos no se duplican ni se modifica `isBase` en rows existentes

---

## Validation Schemas

### createCurrencySchema (Yup)

| Campo | Regla |
|-------|-------|
| `code` | string, required, max 10, uppercase transform |
| `name` | string, required, max 100 |
| `symbol` | string, required, max 10 |
| `isBase` | boolean, default `false` |

### createExchangeRateSchema (Yup)

| Campo | Regla |
|-------|-------|
| `currencyId` | string, required |
| `rateToBase` | number, required, min(0.000001) |
| `effectiveDate` | string, required, formato ISO date |
| `source` | string, optional, max 100 |

---

## Constraints

| Restricción | Detalle |
|-------------|---------|
| `isBase` única | Solo vía `$transaction` — Prisma/MySQL no tiene unique condicional |
| `ExchangeRate` inmutable | Sin `updatedAt` en modelo, sin update/delete en actions |
| `rateToBase` precisión | `Decimal(18,6)` → serializar a `string` antes de enviar al cliente |
| `searchCurrenciesAction` shape | `{ code: string, value: string }[]` donde `value = \`${code} — ${name}\`` |
| Paginación por tab | `paramPrefix: 'monedas_'` y `paramPrefix: 'tasas_'` — cursores independientes |
| FK `currencyCode` en Asset | Referencia `Currency.code` (no `id`) → `returnMode: 'code'` en autocomplete |
| Error codes | `'FORBIDDEN'`, `'NOT_FOUND'`, `'CONFLICT'`, `'VALIDATION'`, `'UNKNOWN'` |
