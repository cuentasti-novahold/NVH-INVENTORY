# Design — Módulo de Gestión de Monedas (`currency-management`)

> Diseño técnico (el COMO arquitectónico). No incluye tasks (eso es la fase siguiente).
> Patrón de referencia 1:1 verificado contra código real: `src/app/(dashboard)/settings/locations/`.
> Stack: Next.js 16.2 App Router · Prisma 7 · MySQL 8 · shadcn/ui + Tailwind 4 · `useTransition` (NO react-query) · Yup server-side · RHF cliente.

---

## 0. Resumen ejecutivo

Página `/settings/currencies` (sección CATÁLOGOS) con dos tabs URL-driven (`?tab=monedas|tasas`), replicando exactamente `LocationsTabs`. CRUD completo de `Currency` con la invariante de negocio **una sola moneda base** garantizada vía `$transaction` (no soportable como unique condicional en MySQL). `ExchangeRate` es **create-only** (historial inmutable — sin `updatedAt` en el schema). `rateToBase` (`Decimal(18,6)`) viaja Server→Client siempre como `string` para no perder precisión. Se reemplaza el `select` hardcodeado `[COP,USD,EUR]` del asset-form por un `autocomplete` dinámico (`searchCurrenciesAction`, `returnMode: 'code'`) que respeta la FK `Asset.currencyCode → Currency.code`.

---

## 1. Arquitectura de componentes

Árbol de archivos (todo bajo `src/app/(dashboard)/settings/currencies/`; NO existe `src/modules/`):

```
settings/currencies/
  page.tsx                                  ← Server Component. auth+RBAC, Promise.all de AMBAS listas, render CurrenciesTabs
  actions.ts                                ← 'use server'. list/search/create/update/delete Currency + list/create ExchangeRate + searchCurrenciesAction
  __tests__/actions.test.ts                 ← isBase única, delete-base bloqueado, P2003, rateToBase string
  presentation/
    components/
      CurrenciesTabs.tsx                    ← 'use client'. Tabs shadcn ?tab= controlado, useTransition + router.replace({scroll:false})
      CurrenciesTablePage.tsx               ← 'use client'. CRUD completo (create/edit/delete), paramPrefix="monedas"
      ExchangeRatesTablePage.tsx            ← 'use client'. CREATE-only (sin edit/delete), paramPrefix="tasas"
      columns-currencies.tsx                ← 'use client'. display: code, name, symbol, isBase (badge)
      columns-exchange-rates.tsx            ← 'use client'. display: currencyCode, rateToBase, effectiveDate, source
    dto/
      currency.dto.ts                       ← CurrencyRow, CreateCurrencyDTO, UpdateCurrencyDTO
      exchange-rate.dto.ts                  ← ExchangeRateRow, CreateExchangeRateDTO  (NO UpdateExchangeRateDTO)
    forms/
      currency-form.config.ts              ← FormConfig: code, name, symbol, isBase (switch)
      exchange-rate-form.config.ts         ← FormConfig: currencyCode (autocomplete), rateToBase (number), effectiveDate (date), source (text)
    hooks/
      use-currencies.ts                     ← create/update/remove (patrón use-countries)
      use-exchange-rates.ts                 ← create SOLO (sin update/remove)
    mappers/
      currency.mapper.ts                    ← toCurrencyRow
      exchange-rate.mapper.ts               ← toExchangeRateRow (rateToBase.toString())
    schemas/
      currency.schema.ts                    ← currencyCreateSchema / currencyUpdateSchema
      exchange-rate.schema.ts               ← exchangeRateCreateSchema (NO update)
```

Diagrama de render:

```
page.tsx (Server)
  ├─ auth() + hasPermission('currencies','read')   → redirect('/') si falla
  ├─ Promise.all([ listCurrenciesAction(...), listExchangeRatesAction(...) ])   (ambas SIEMPRE, no lazy por tab)
  └─ <CurrenciesTabs initialTab canWrite currencies={...} exchangeRates={...} currenciesQ tasasQ>
        ├─ Tab "monedas" → <CurrenciesTablePage paramPrefix="monedas" ... />
        │     ├─ <TablePageToolbar> (search + botón "Nueva moneda")
        │     ├─ <MainDataTable> (cursor pageInfo + onNextPage/onPrevPage)
        │     ├─ <CrudFormDialog> create (currencyFormConfig)
        │     └─ <CrudFormDialog> edit  (key={editKey}, defaultValues=editing)
        └─ Tab "tasas" → <ExchangeRatesTablePage paramPrefix="tasas" ... />
              ├─ <TablePageToolbar> (search opcional + botón "Nueva tasa")
              ├─ <MainDataTable> (cursor)
              └─ <CrudFormDialog> create SOLO   (sin botón edit/delete en columns)
```

---

## 2. Schema Prisma (existente — verificado, NO se modifica)

```prisma
model Currency {
  id            String         @id @default(cuid())
  code          String         @unique          // "COP" — FK target de Asset.currencyCode
  name          String
  symbol        String
  isBase        Boolean        @default(false)  // invariante: a lo sumo una true (garantía en código)
  exchangeRates ExchangeRate[]                  // FK currencyId (required) → restringe delete
  assets        Asset[]                         // FK currencyCode (nullable) → restringe delete
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  @@map("currencies")
}

model ExchangeRate {
  id            String   @id @default(cuid())
  currencyId    String
  currency      Currency @relation(fields: [currencyId], references: [id])
  rateToBase    Decimal  @db.Decimal(18, 6)     // NUNCA number en cliente → siempre string
  effectiveDate DateTime
  source        String?
  createdAt     DateTime @default(now())         // NO updatedAt → inmutable por diseño
  @@index([currencyId, effectiveDate])
  @@map("exchange_rates")
}
```

> `ExchangeRate` no tiene `updatedAt`: el modelo de datos ya declara inmutabilidad. Por eso el hook y las actions son create-only — no es una restricción inventada en la UI, es coherencia con el schema.

---

## 3. Includes de Prisma

```ts
// currencyInclude — Currency necesita contar dependientes para proteger el delete y mostrar en columnas
const currencyInclude = {
  _count: { select: { assets: true, exchangeRates: true } },
} as const;

// exchangeRateInclude — ExchangeRate necesita el code/symbol de su moneda para la columna
const exchangeRateInclude = {
  currency: { select: { code: true, name: true, symbol: true } },
} as const;
```

---

## 4. Tipos de mapper (shape exacto de los includes)

```ts
// currency.mapper.ts
type CurrencyWithRelations = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  _count: { assets: number; exchangeRates: number };
};

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

// exchange-rate.mapper.ts — Decimal → string (patrón verificado en asset.mapper.ts:19-22)
type ExchangeRateWithRelations = {
  id: string;
  currencyId: string;
  rateToBase: { toString(): string };          // Prisma Decimal NO es number — solo expone toString()
  effectiveDate: Date;
  source: string | null;
  currency: { code: string; name: string; symbol: string };
};

export function toExchangeRateRow(r: ExchangeRateWithRelations): ExchangeRateRow {
  return {
    id: r.id,
    currencyId: r.currencyId,
    currencyCode: r.currency.code,
    currencyName: r.currency.name,
    rateToBase: r.rateToBase.toString(),         // ← string, NUNCA Number(...)
    effectiveDate: r.effectiveDate.toISOString(),
    source: r.source,
  };
}
```

---

## 5. DTOs

```ts
// currency.dto.ts
export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  assetsCount: number;
  ratesCount: number;
}
export interface CreateCurrencyDTO { code: string; name: string; symbol: string; isBase: boolean; }
export type UpdateCurrencyDTO = Partial<CreateCurrencyDTO>;

// exchange-rate.dto.ts  (NO UpdateExchangeRateDTO — create-only)
export interface ExchangeRateRow {
  id: string;
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  rateToBase: string;          // ← string siempre
  effectiveDate: string;       // ISO
  source: string | null;
}
export interface CreateExchangeRateDTO {
  currencyId: string;
  rateToBase: string;          // del input number → llega como string desde RHF; Prisma acepta string en Decimal
  effectiveDate: string;       // ISO date
  source?: string | null;
}
```

---

## 6. Schemas Yup

```ts
// currency.schema.ts
export const currencyCreateSchema = yup.object({
  code: yup.string().trim().uppercase().matches(/^[A-Z]{3}$/, 'ISO-4217: 3 letras mayúsculas').required('Código requerido'),
  name: yup.string().trim().min(2).max(60).required('Nombre requerido'),
  symbol: yup.string().trim().min(1).max(5).required('Símbolo requerido'),
  isBase: yup.boolean().default(false),
});
export const currencyUpdateSchema = currencyCreateSchema.partial();

// exchange-rate.schema.ts  (sin update)
export const exchangeRateCreateSchema = yup.object({
  currencyId: yup.string().trim().required('Moneda requerida'),
  rateToBase: yup.string().trim()
    .matches(/^\d+(\.\d{1,6})?$/, 'Número con hasta 6 decimales')
    .required('Tasa requerida'),
  effectiveDate: yup.string().trim().required('Fecha requerida'),
  source: yup.string().trim().max(120).nullable().optional(),
});
```

> `rateToBase` se valida como **string** (no `yup.number()`) para preservar precisión decimal end-to-end. La regex limita a 6 decimales (coherente con `Decimal(18,6)`).

---

## 7. Pseudocódigo de actions críticas (`'use server'`)

Reutiliza los helpers existentes de `locations/actions.ts`: `requireWrite()` (cambiando recurso a `'currencies'`), `isP2002`, `isP2025`, `yupToFieldErrors`, y se agrega `isP2003`. Patrón de paginación cursor idéntico (`take: limit + 1`, composite orderBy `[{createdAt:'desc'},{id:'desc'}]`, `$transaction([findMany, count])`).

### D1 — `createCurrencyAction` (isBase única, atómica)

```ts
export async function createCurrencyAction(input: CreateCurrencyDTO): Promise<ActionResult<CurrencyRow>> {
  const g = await requireWrite();              // hasPermission(role, 'currencies', 'create')
  if (!g.ok) return g.error;

  let dto: CreateCurrencyDTO;
  try { dto = await currencyCreateSchema.validate(input, { abortEarly: false }) as CreateCurrencyDTO; }
  catch (e) { return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e)); }

  try {
    const c = await prisma.$transaction(async (tx) => {
      // 1. Si la nueva es base → desmarcar cualquier base previa ANTES de crear
      if (dto.isBase) {
        await tx.currency.updateMany({ where: { isBase: true }, data: { isBase: false } });
      }
      // 2. Crear
      return tx.currency.create({ data: dto, include: currencyInclude });
    });
    revalidatePath('/settings/currencies');
    return ok(toCurrencyRow(c));
  } catch (e) {
    if (isP2002(e, 'code')) return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una moneda con este código' });
    return err('UNKNOWN', 'Error al crear moneda');
  }
}
```

### D1 — `updateCurrencyAction` (isBase única, atómica; NOT self)

```ts
export async function updateCurrencyAction(id: string, input: UpdateCurrencyDTO): Promise<ActionResult<CurrencyRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: UpdateCurrencyDTO;
  try { dto = await currencyUpdateSchema.validate(input, { abortEarly: false }) as UpdateCurrencyDTO; }
  catch (e) { return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e)); }

  try {
    const c = await prisma.$transaction(async (tx) => {
      // 1. Si se está marcando como base → desmarcar las OTRAS (NOT id) primero
      if (dto.isBase === true) {
        await tx.currency.updateMany({ where: { isBase: true, NOT: { id } }, data: { isBase: false } });
      }
      // 2. Update (solo campos presentes)
      return tx.currency.update({ where: { id }, data: dto, include: currencyInclude });
    });
    revalidatePath('/settings/currencies');
    return ok(toCurrencyRow(c));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    if (isP2002(e, 'code')) return err('CONFLICT', 'Código duplicado', { code: 'Ya existe una moneda con este código' });
    return err('UNKNOWN', 'Error al actualizar moneda');
  }
}
```

> Razonamiento D1: MySQL no soporta índice unique condicional (`WHERE isBase = true`). El patrón canónico es desmarcar-luego-marcar dentro de una transacción interactiva (`tx`), que es atómica: o ambas operaciones se aplican o ninguna. `updateMany` con `NOT: { id }` en update evita un toggle accidental sobre la propia fila. No se permite "desmarcar la única base" — si `dto.isBase === false` no se fuerza nada; queda la posibilidad de cero bases, que es válida transitoriamente y la protegida es la base contra borrado (D5). Si se quisiera invariante "siempre exactamente una", se añadiría un guard que rechace desmarcar la última, pero el alcance OUT lo excluye.

### D5 — `deleteCurrencyAction` (base protegida + check previo con `_count`)

```ts
export async function deleteCurrencyAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  // Check previo robusto: leemos isBase + _count en una sola query (más claro que depender de P2003)
  const row = await prisma.currency.findUnique({
    where: { id },
    select: { isBase: true, _count: { select: { assets: true, exchangeRates: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Moneda no encontrada');

  // 1. Bloquear borrado de la moneda base
  if (row.isBase) return err('CONFLICT', 'No se puede eliminar la moneda base');

  // 2. Bloquear si tiene dependientes (mensaje claro al usuario)
  if (row._count.assets > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.assets} activos asociados`);
  if (row._count.exchangeRates > 0)
    return err('HAS_CHILDREN', `No se puede eliminar: tiene ${row._count.exchangeRates} tasas de cambio asociadas`);

  // 3. Red de seguridad: si una FK se crea entre el check y el delete, P2003 igual lo frena
  try {
    await prisma.currency.delete({ where: { id } });
  } catch (e) {
    if (isP2003(e)) return err('HAS_CHILDREN', 'No se puede eliminar: la moneda tiene registros asociados');
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    return err('UNKNOWN', 'Error al eliminar moneda');
  }
  revalidatePath('/settings/currencies');
  return ok(undefined);
}

function isP2003(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2003';
}
```

> Razonamiento D5: **check previo con `_count` es más robusto como UX** (mensaje específico: cuántos activos / cuántas tasas), igual que `deleteCountryAction`/`deleteCityAction` ya hacen en el proyecto. Pero el check tiene una ventana de carrera (TOCTOU): entre leer y borrar podría crearse un dependiente. Por eso se mantiene el `try/catch` con `isP2003` como red de seguridad. Es defensa en profundidad: el `_count` da el buen mensaje en el 99% de los casos; el P2003 garantiza integridad en el caso límite.

### D2 — `createExchangeRateAction` (Decimal: string in → string out)

```ts
export async function createExchangeRateAction(input: CreateExchangeRateDTO): Promise<ActionResult<ExchangeRateRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: CreateExchangeRateDTO;
  try { dto = await exchangeRateCreateSchema.validate(input, { abortEarly: false }) as CreateExchangeRateDTO; }
  catch (e) { return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e)); }

  try {
    const r = await prisma.exchangeRate.create({
      data: {
        currency: { connect: { id: dto.currencyId } },
        rateToBase: dto.rateToBase,             // string → Prisma acepta string|number|Decimal para campos Decimal; string preserva precisión
        effectiveDate: new Date(dto.effectiveDate),
        source: dto.source ?? null,
      },
      include: exchangeRateInclude,
    });
    revalidatePath('/settings/currencies');
    return ok(toExchangeRateRow(r));            // mapper hace rateToBase.toString()
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Moneda no encontrada');
    return err('UNKNOWN', 'Error al registrar tasa de cambio');
  }
}
```

> Razonamiento D2: Prisma acepta `string | number | Prisma.Decimal` en columnas `Decimal`. Pasar el **string crudo** (no `parseFloat`) evita el redondeo de IEEE-754 que introduciría `Number`. El input HTML es `type:"number"` pero RHF entrega el valor como string; lo dejamos string en todo el flujo. La salida también es string (`mapper.toString()`). En NINGÚN punto del path Currency aparece `number` para `rateToBase`. (Nota: la prop de la propuesta sugería `parseFloat` — se DESCARTA por pérdida de precisión; el string directo es estrictamente mejor y Prisma lo soporta.)

### D4 — `searchCurrenciesAction` (autocomplete, `'use server'`)

```ts
export async function searchCurrenciesAction(query: string): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const q = query.trim();
  const rows = await prisma.currency.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : undefined,
    select: { code: true, name: true },
    take: 20,
    orderBy: { code: 'asc' },
  });
  // shape AutocompleteOption: returnMode 'code' → guarda r.code (= Currency.code, FK target de Asset.currencyCode)
  return ok(rows.map((r) => ({ code: r.code, value: `${r.code} — ${r.name}` })));
}
```

> Razonamiento D4: `returnMode: 'code'` hace que el form persista `option.code`. Devolvemos `code: r.code` (NO el `id`), porque la FK `Asset.currencyCode` referencia `Currency.code`, no `Currency.id`. Esto difiere de `searchCountriesAction`, que devuelve `code: r.id` porque ahí la FK apunta a `id`. Es la diferencia clave: el "code" del AutocompleteOption es lo que se guarda, y para currency debe ser el `code` ISO. `where` con `q` vacío devuelve las primeras 20 (soporta `minChars: 0` del asset-form para mostrar opciones sin tipear).

### Listing actions (patrón cursor idéntico a locations)

`listCurrenciesAction(params)` — `q` busca en `OR: [{code contains}, {name contains}]`, `include: currencyInclude`, mismo bloque cursor/orderBy/`$transaction([findMany, count])`/`pageInfo`.
`listExchangeRatesAction(params)` — `q` opcional sobre `currency: { code: { contains } }`, `include: exchangeRateInclude`, mismo bloque cursor.

---

## 8. FormConfig sketches

```ts
// currency-form.config.ts
export const currencyFormConfig: FormConfig = {
  fields: [],
  sections: [{
    title: 'Datos de la moneda',
    fields: [
      { name: 'code',   label: 'Código ISO', type: 'text',   required: true, gridCols: 2, maxLength: 3,
        placeholder: 'COP, USD, EUR…', pattern: { regex: '^[A-Z]{3}$', message: 'ISO-4217: 3 letras mayúsculas' } },
      { name: 'symbol', label: 'Símbolo',    type: 'text',   required: true, gridCols: 2, maxLength: 5, placeholder: '$, US$, €' },
      { name: 'name',   label: 'Nombre',     type: 'text',   required: true, gridCols: 1, maxLength: 60, placeholder: 'Peso colombiano' },
      { name: 'isBase', label: 'Moneda base', type: 'switch', gridCols: 1 },
    ],
  }],
};

// exchange-rate-form.config.ts
import { searchCurrenciesAction } from '@/app/(dashboard)/settings/currencies/actions';

export const exchangeRateFormConfig: FormConfig = {
  fields: [],
  sections: [{
    title: 'Registrar tasa de cambio',
    fields: [
      { name: 'currencyId', label: 'Moneda', type: 'autocomplete', required: true, gridCols: 2,
        autocompleteConfig: {
          searchAction: (q) => searchCurrenciesAction(q).then((r) => (r.ok ? r.data : [])),
          returnMode: 'code',           // OJO: este form guarda el code; ver nota abajo
          placeholder: 'Buscar moneda…', minChars: 0,
        } },
      { name: 'rateToBase',    label: 'Tasa a base', type: 'number', required: true, gridCols: 2, min: 0, placeholder: '4000.00' },
      { name: 'effectiveDate', label: 'Fecha efectiva', type: 'date', required: true, gridCols: 2 },
      { name: 'source',        label: 'Fuente', type: 'text', gridCols: 2, maxLength: 120, placeholder: 'Banco de la República…' },
    ],
  }],
};
```

> Nota de implementación sobre `currencyId` en el form de tasas: `CreateExchangeRateDTO.currencyId` es el `id` (la FK `ExchangeRate.currencyId → Currency.id`). Dos opciones para resolverlo en la fase de tasks:
> (a) hacer que `searchCurrenciesAction` devuelva `code: r.id` SOLO para este form — pero el asset-form necesita `code: r.code`. Conflicto.
> (b) **Recomendado**: crear `searchCurrenciesByIdAction` (devuelve `{ code: r.id, value: '…' }`) para el form de tasas, y mantener `searchCurrenciesAction` (devuelve `{ code: r.code, … }`) para el asset-form. Una action por target de FK, sin ambigüedad. Esta decisión se baja a tasks.

---

## 9. Fix de `asset-form.config.ts` — campo `currencyCode`

Reemplazar el bloque `select` hardcodeado (líneas 245-254) por autocomplete dinámico. Código exacto del nuevo campo:

```ts
{
  name: 'currencyCode',
  label: 'Moneda',
  type: 'autocomplete',
  gridCols: 2,
  autocompleteConfig: {
    searchAction: (q) => searchCurrenciesAction(q).then((r) => (r.ok ? r.data : [])),
    returnMode: 'code',                     // guarda Currency.code → satisface FK Asset.currencyCode
    placeholder: 'Buscar moneda…',
    minChars: 0,                            // muestra opciones sin tipear (catálogo corto)
    initialDisplayValue: editing?.currencyCode ?? 'COP',
  },
},
```

Import a agregar en el header del archivo:

```ts
import { searchCurrenciesAction } from '@/app/(dashboard)/settings/currencies/actions';
```

`buildAssetDefaultValues` mantiene `currencyCode: 'COP'` como default (líneas 38 y 57 sin cambios). `buildAssetDTO` mantiene `currencyCode: (data.currencyCode as string) || 'COP'` (línea 88 sin cambios).

> Riesgo R7 (de la propuesta): este fix depende de que `searchCurrenciesAction` exista. Desplegar juntos — el import romperá el build si la action no está. Orden en tasks: actions.ts de currencies ANTES del fix del asset-form.

---

## 10. Hooks — firmas

```ts
// use-currencies.ts  (patrón use-countries: useTransition + toast + fieldErrors, NO react-query)
export function useCurrencies(): {
  pending: boolean;
  fieldErrors: Record<string, string>;
  create: (dto: CreateCurrencyDTO, onSuccess: (row: CurrencyRow) => void) => void;
  update: (id: string, dto: UpdateCurrencyDTO, onSuccess: (row: CurrencyRow) => void) => void;
  remove: (id: string, onSuccess: () => void) => void;
};

// use-exchange-rates.ts  (CREATE-only — sin update ni remove, por inmutabilidad del schema)
export function useExchangeRates(): {
  pending: boolean;
  fieldErrors: Record<string, string>;
  create: (dto: CreateExchangeRateDTO, onSuccess: (row: ExchangeRateRow) => void) => void;
};
```

---

## 11. Decisiones D3 y D6 (resueltas)

### D3 — Paginación por tab con `paramPrefix`
Verificado en `CountriesTablePage.tsx:41-49`: `updateParams` prefija cada key con `${paramPrefix}_`. `page.tsx` lee los searchParams ya prefijados. Replicar exacto:
- Tab monedas (`paramPrefix="monedas"`): `monedas_afterCursor`, `monedas_beforeCursor`, `monedas_pageSize`, `monedas_q`.
- Tab tasas (`paramPrefix="tasas"`): `tasas_afterCursor`, `tasas_beforeCursor`, `tasas_pageSize`, `tasas_q`.
`MainDataTable` recibe `pageInfo` + `onNextPage`/`onPrevPage` (NUNCA `pageCount`/offset). `onNextPage` → `updateParams({ afterCursor: endCursor, beforeCursor: null })`; `onPrevPage` → `{ beforeCursor: startCursor, afterCursor: null }`. Cambiar `q` resetea ambos cursores a `null`.

### D6 — `CurrenciesTabs`: tab default y carga
- `TAB_CONFIG = [{ value:'monedas', label:'Monedas', icon: Coins }, { value:'tasas', label:'Tasas de cambio', icon: TrendingUp }]`.
- Tab default `'monedas'`. `validTabs` en page.tsx: `['monedas','tasas']`; si `sp.tab` no es válido → `'monedas'`.
- `page.tsx` resuelve AMBAS listas en `Promise.all` independientemente del tab activo (igual que LocationsTabs — no lazy-load por tab). Razón: el costo de dos queries paginadas a tablas pequeñas es trivial y evita un flash al cambiar de tab.
- `pageSize=20` para ambos tabs (`parsePageSize` clamp 5-100). Monedas será < 20 (catálogo); tasas crece con el tiempo pero la paginación cursor lo absorbe.

---

## 12. Cambios fuera del módulo (de la propuesta, confirmados)

1. `src/lib/permissions.ts`: agregar `'currencies'` al type `Resource`; `ADMIN: [...,'currencies:*']`; `MANAGER/TECHNICIAN/VIEWER: [...,'currencies:read']`; `SUPER_ADMIN` ya cubre con `'*'`.
2. `src/components/dashboard/sidebar-nav-config.ts`: link a `/settings/currencies` en CATÁLOGOS, icono `Coins`.
3. `src/app/(dashboard)/assets/.../asset-form.config.ts`: fix sección 9.
4. `scripts/sql/seed-currencies.sql`: upsert idempotente COP(base)+USD+EUR vía `ON DUPLICATE KEY UPDATE` que NO pisa `isBase` en update.

---

## 13. ADR — decisiones de arquitectura

| # | Decisión | Alternativas rechazadas | Razón |
|---|----------|-------------------------|-------|
| ADR-1 | `isBase` única vía transacción interactiva (`updateMany NOT id` → create/update) | Unique index condicional MySQL; trigger DB; check a nivel app sin tx | MySQL no soporta unique parcial; tx interactiva es atómica y portable; sin triggers fuera del schema |
| ADR-2 | `rateToBase` siempre `string` (in y out), sin `parseFloat` | `parseFloat`→number (propuesta original); `Decimal.js` en cliente | `Number` rompe precisión IEEE-754; Prisma acepta string en Decimal; patrón ya usado en asset.mapper |
| ADR-3 | `ExchangeRate` create-only (sin update/delete en hook ni actions) | CRUD completo | Schema sin `updatedAt` → inmutabilidad por diseño; historial de tasas no se edita |
| ADR-4 | delete protegido con `_count` previo + `isP2003` de respaldo | Solo P2003; solo `_count` | `_count` da mensaje específico (UX); P2003 cubre carrera TOCTOU (integridad) |
| ADR-5 | `searchCurrenciesAction` devuelve `code: Currency.code` (no id) | Devolver `id` | FK `Asset.currencyCode → Currency.code`; `returnMode:'code'` persiste ese valor |
| ADR-6 | Dos search actions (by-code para assets, by-id para tasas) | Una sola action reutilizada | Targets de FK distintos (`code` vs `id`); evitar ambigüedad en `returnMode` |
| ADR-7 | Carga eager de ambos tabs en `page.tsx` (Promise.all) | Lazy-load por tab | Catálogo pequeño; evita flash al cambiar tab; paridad 1:1 con LocationsTabs |

---

## 14. Riesgos / supuestos a validar

- **R-A**: La estrategia D6(b) (dos search actions) asume que el form de tasas necesita `currencyId` (id). Confirmado por schema (`ExchangeRate.currencyId → Currency.id`). Bajar la creación de `searchCurrenciesByIdAction` a tasks.
- **R-B**: El orden de despliegue importa (R7): `currencies/actions.ts` antes del fix de `asset-form` (import duro). Si se hacen PRs separados, deben encadenarse.
- **R-C**: `type: 'switch'` debe estar soportado por `CrudFormDialog` para `isBase`. El type union de `FormFieldConfig` lo incluye (`'switch'`), pero verificar render en el form-builder durante apply.
- **R-D**: `minChars: 0` requiere que el componente autocomplete dispare la búsqueda con query vacío. `searchCurrenciesAction` lo soporta (where undefined si q vacío); verificar el comportamiento del componente en apply.
- **R-E**: La invariante "siempre exactamente una base" NO está garantizada (puede quedar cero bases si se desmarca la única). Está en alcance OUT; si negocio lo requiere, añadir guard en update. La base SÍ está protegida contra borrado (D5).
```
