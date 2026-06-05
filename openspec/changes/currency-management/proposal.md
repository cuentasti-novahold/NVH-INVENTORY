# Propuesta: Módulo de Gestión de Monedas (Currency Management)

**Change name:** `currency-management`
**Fase:** propose
**Backend artefactos:** engram (`sdd/currency-management/proposal`) + openspec (este archivo)
**Módulo de referencia:** `src/app/(dashboard)/settings/locations/` (LocationsTabs)

---

## 1. Resumen ejecutivo

**Problema:** No existe gestión de monedas en el sistema. El campo `currencyCode` del formulario de activos usa un `select` con opciones hardcodeadas `[COP, USD, EUR]` que **bypasea la FK** `Asset.currencyCode → Currency.code`. En producción la tabla `currencies` puede estar vacía (el seed solo corre con `prisma db seed`), lo que provoca **errores P2003 al crear activos**. Además, no hay forma de administrar tasas de cambio (`ExchangeRate`) desde la UI, ni permisos RBAC declarados para el recurso.

**Por qué ahora:** El modelo `Currency`/`ExchangeRate` ya existe en el schema y los activos ya dependen de él. Sin UI ni seed garantizado, cada deploy a producción arrastra el riesgo de FK rota. Es el momento de cerrar el gap antes de que crezca el volumen de activos.

**Cómo se ve el éxito:**
- Página `/settings/currencies` en la sección CATÁLOGOS, con dos tabs: **Monedas** y **Tasas de Cambio**.
- CRUD completo de `Currency` (con regla `isBase` única) y CREATE-only de `ExchangeRate` (historial inmutable).
- El formulario de activos resuelve `currencyCode` dinámicamente desde la DB (autocomplete), eliminando el riesgo de P2003.
- RBAC: `currencies` declarado como recurso; escritura solo ADMIN/SUPER_ADMIN, lectura para todos.
- Las 3 monedas base (COP/USD/EUR) garantizadas en producción vía script SQL de upsert.

---

## 2. Alcance

### Entra (in-scope)
- Módulo `src/app/(dashboard)/settings/currencies/` siguiendo el patrón 1:1 de `locations/`.
- `CurrenciesTabs` con tabs **Monedas** + **Tasas de Cambio** (patrón `LocationsTabs`).
- CRUD de `Currency` (create / read / update / delete) con validación de unicidad de `isBase`.
- CREATE + READ de `ExchangeRate` (sin edit, sin delete — historial contable inmutable).
- Server Actions en `actions.ts` con `'use server'`, paginación cursor-based, guards RBAC.
- Nuevo recurso `currencies` en `permissions.ts`.
- Link en sidebar (`Coins` icon).
- Fix del campo `currencyCode` en `asset-form.config.ts`: `select` hardcoded → `autocomplete` dinámico con `searchCurrenciesAction` (returnMode `'code'`).
- Script SQL de deploy: upsert idempotente de COP/USD/EUR.
- Tests de `actions.ts` (patrón `locations/__tests__/actions.test.ts`).

### No entra (out-of-scope)
- Integración con APIs externas de tasas de cambio (carga automática). Las tasas se cargan manualmente.
- Conversión automática/recálculo de `purchasePriceBase` de activos existentes al cambiar tasas (la depreciación ya es dinámica; no se toca).
- Edición o borrado de `ExchangeRate` (es inmutable por diseño contable).
- Migración de datos de activos con FK rota preexistente (el upsert previene el problema hacia adelante; reparar datos rotos es un change aparte).
- Multi-moneda en reportes/analítica.

---

## 3. Estructura de archivos (paths completos)

### Archivos nuevos
```
src/app/(dashboard)/settings/currencies/
  page.tsx                                              # Server Component shell
  actions.ts                                            # 'use server' — todas las actions
  __tests__/actions.test.ts                             # tests del action layer
  presentation/
    components/
      CurrenciesTabs.tsx                                # 'use client' — Tabs (patrón LocationsTabs)
      CurrenciesTablePage.tsx                           # 'use client' — CRUD Currency
      ExchangeRatesTablePage.tsx                        # 'use client' — CREATE-only ExchangeRate
      columns-currencies.tsx                            # 'use client' — display only
      columns-exchange-rates.tsx                        # 'use client' — display only
    dto/
      currency.dto.ts                                   # CurrencyRow + Create/Update DTO
      exchange-rate.dto.ts                              # ExchangeRateRow + Create DTO
    forms/
      currency-form.config.ts                           # FormConfig de Currency
      exchange-rate-form.config.ts                      # FormConfig de ExchangeRate (create)
    hooks/
      use-currencies.ts                                 # useTransition + toast
      use-exchange-rates.ts                             # useTransition + toast (create only)
    mappers/
      currency.mapper.ts                                # Prisma → CurrencyRow
      exchange-rate.mapper.ts                           # Prisma → ExchangeRateRow (Decimal → string)
    schemas/
      currency.schema.ts                                # Yup create + update.partial()
      exchange-rate.schema.ts                           # Yup create
```

### Archivos modificados
```
src/lib/permissions.ts                                  # + resource 'currencies' + permisos por rol
src/components/dashboard/sidebar-nav-config.ts          # + link /settings/currencies (Coins)
src/app/(dashboard)/assets/presentation/forms/asset-form.config.ts   # select → autocomplete
```

### Artefacto de deploy
```
scripts/sql/seed-currencies.sql                         # upsert idempotente COP/USD/EUR
```

---

## 4. Cambios en archivos existentes

### 4.1 `src/components/dashboard/sidebar-nav-config.ts`
Agregar `Coins` al import de `lucide-react` y un item en la sección CATÁLOGOS:
```ts
{ href: '/settings/categories', label: 'Categorías', icon: Boxes },
{ href: '/settings/locations',  label: 'Ubicaciones', icon: MapPin },
{ href: '/settings/currencies', label: 'Monedas',     icon: Coins },   // ← nuevo
```

### 4.2 `src/lib/permissions.ts`
Ver sección 5 (RBAC).

### 4.3 `src/app/(dashboard)/assets/presentation/forms/asset-form.config.ts`
Reemplazar el `select` hardcodeado (líneas ~244-254) por un `autocomplete` dinámico.
**Crítico:** el campo `currencyCode` se persiste como **código** (FK a `Currency.code`), por lo que `returnMode` debe ser `'code'`, igual que `categoryId`/`locationId`.
```ts
{
  name: 'currencyCode',
  label: 'Moneda',
  type: 'autocomplete',
  gridCols: 2,
  autocompleteConfig: {
    searchAction: (q) => searchCurrenciesAction(q).then((r) => (r.ok ? r.data : [])),
    returnMode: 'code',                      // devuelve Currency.code, no el id
    placeholder: 'Buscar moneda…',
    minChars: 0,                             // pocas monedas → mostrar todas al abrir
    initialDisplayValue: editing?.currencyCode ?? 'COP',
  },
},
```
`buildAssetDefaultValues` mantiene `currencyCode: 'COP'` como default (no cambia). `searchCurrenciesAction` debe devolver `{ value: code, label: \`${code} — ${name}\` }[]`.

---

## 5. RBAC — extensión de `permissions.ts`

Agregar `'currencies'` al union `Resource` y declarar permisos por rol:

```ts
export type Resource =
  | 'assets' | 'employees' | 'assignments' | 'categories'
  | 'locations' | 'maintenance' | 'users' | 'movements'
  | 'currencies';                                    // ← nuevo

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ['*'],                                // ya cubre currencies:*
  ADMIN:       [..., 'currencies:*'],                // CRUD completo
  MANAGER:     [..., 'currencies:read'],
  TECHNICIAN:  [..., 'currencies:read'],
  VIEWER:      [..., 'currencies:read'],
};
```
- `SUPER_ADMIN` ya tiene `'*'` → no necesita entrada explícita.
- El tipo `Permission` (`\`${Resource}:*\`` / `\`${Resource}:${Action}\``) deriva automáticamente las variantes de `currencies` al extender `Resource`.
- Guards en `actions.ts`: `read` para los `list*`/`search*`; `create` (vía `requireWrite`) para create/update/delete de Currency y create de ExchangeRate.
- `page.tsx`: `hasPermission(role, 'currencies', 'read')` para acceso; `canWrite = hasPermission(role, 'currencies', 'create')`.

---

## 6. Patrón de tabs — `CurrenciesTabs`

Réplica directa de `LocationsTabs`:
- Header con icono `Coins`, título "Monedas", subtítulo "Monedas y tasas de cambio".
- `<Tabs>` (shadcn/ui) controlado por `?tab=` en la URL, vía `useTransition` + `router.replace(..., { scroll: false })`.
- `TAB_CONFIG`: `[{ value: 'monedas', label: 'Monedas', icon: Coins }, { value: 'tasas', label: 'Tasas de Cambio', icon: TrendingUp }]`.
- Tab válido por defecto: `monedas`.
- `page.tsx` (Server Component): auth guard → `Promise.all([listCurrenciesAction(...), listExchangeRatesAction(...)])` → pasa `initialRows / rowCount / pageInfo / canWrite / currentQ` a cada TablePage con su `paramPrefix` (`monedas_*`, `tasas_*`).
- Cada `TabsContent` renderiza su `*TablePage` con paginación cursor-based independiente.

---

## 7. Regla `isBase` — solo una moneda base a la vez

`isBase` no tiene constraint a nivel schema (Prisma no soporta "único condicional" en MySQL). Se valida **en código dentro de `$transaction`**:

- **createCurrencyAction / updateCurrencyAction**: si el DTO trae `isBase: true`, dentro del `$transaction`:
  1. `updateMany({ where: { isBase: true, NOT: { id } }, data: { isBase: false } })` — desmarca la base anterior.
  2. crea/actualiza la moneda actual con `isBase: true`.
- **deleteCurrencyAction**: rechazar borrar la moneda base activa (`err('CONFLICT', 'No se puede eliminar la moneda base')`). Tampoco se puede borrar una moneda con activos o tasas asociadas (P2003) → mensaje claro.
- La transacción garantiza atomicidad: nunca quedan dos bases ni cero bases simultáneamente.
- En la UI: badge "Base" en la fila correspondiente; al marcar una nueva como base, la anterior se desmarca de forma transparente.

---

## 8. `ExchangeRate` inmutable — solo crear

El modelo `ExchangeRate` **no tiene `updatedAt`** → es historial contable inmutable:
- `ExchangeRatesTablePage`: sin botón **Editar**, sin botón **Eliminar**. Solo **Agregar tasa**.
- `use-exchange-rates.ts`: expone únicamente `create` (no `update`/`remove`).
- Form de creación: `currencyId` (autocomplete de monedas), `rateToBase` (number, `Decimal(18,6)` → en form `type: "number"`, en mapper se convierte a string para evitar pérdida de precisión), `effectiveDate` (date, default hoy), `source` (text, opcional).
- Listado: ordenado por `effectiveDate desc`; la tasa **vigente** por moneda es la más reciente. Mostrar columna de moneda + tasa + fecha efectiva + fuente. Filtro opcional por moneda (índice `[currencyId, effectiveDate]` ya existe).
- Mapper: `rateToBase` (Prisma `Decimal`) → `string` en el Row para no perder precisión en la serialización Server→Client.

---

## 9. Fix del asset form — `currencyCode` dinámico

Ver 4.3. Resumen del cambio y su justificación:
- **Antes:** `select` con `[COP, USD, EUR]` hardcodeados → si se crea una moneda nueva no aparece, y si la DB no tiene esos códigos se rompe la FK (P2003).
- **Después:** `autocomplete` con `searchCurrenciesAction` (Server Action en el módulo currencies) que consulta `Currency` en la DB.
- `returnMode: 'code'` porque `Asset.currencyCode` es FK a `Currency.code` (no al id).
- `minChars: 0` para mostrar todas las monedas al abrir (el universo es pequeño).
- Default `'COP'` se conserva en `buildAssetDefaultValues`.

---

## 10. Riesgos y dependencias

| # | Riesgo | Mitigación |
|---|--------|------------|
| R1 | **P2003 en producción** si hay activos con `currencyCode` sin fila en `currencies`. | Ejecutar `scripts/sql/seed-currencies.sql` (upsert idempotente) **antes** de exponer la creación de activos. Dependencia de deploy bloqueante. |
| R2 | **Doble moneda base** si la validación `isBase` no es atómica. | `$transaction` con `updateMany` que desmarca la base previa (sección 7). |
| R3 | **Edición indebida de `ExchangeRate`** rompería el historial contable. | No exponer edit/delete en UI ni en hook; solo `create` (sección 8). |
| R4 | **Pérdida de precisión** de `Decimal(18,6)` al serializar Server→Client. | Mapear `rateToBase` a `string`, no a `number`. |
| R5 | **RBAC ausente** permitiría acceso indebido si las actions se crean sin guard. | Declarar `currencies` en `permissions.ts` y agregar guards en TODAS las actions antes de exponer la página. |
| R6 | **Borrado de moneda con activos/tasas asociadas** → P2003. | Capturar P2003 en `deleteCurrencyAction` y devolver mensaje claro; bloquear borrado de la moneda base. |
| R7 | **Desfase del asset form** si se despliega el fix de autocomplete sin que `searchCurrenciesAction` exista. | El fix de `asset-form.config.ts` depende de que `actions.ts` (currencies) ya exponga `searchCurrenciesAction`. Implementar/desplegar juntos. |

**Dependencias de implementación:**
- `searchCurrenciesAction` (actions.ts) debe existir antes del fix de `asset-form.config.ts`.
- `permissions.ts` debe extenderse antes de exponer `page.tsx`.
- El script SQL de seed debe correr antes del primer uso en producción.

---

## 11. Script SQL de deploy — upsert COP/USD/EUR

Idempotente (re-ejecutable sin duplicar). Garantiza las 3 monedas base en producción sin correr el seed completo. **Solo una moneda con `isBase = 1` (COP).**

```sql
-- scripts/sql/seed-currencies.sql
-- Upsert idempotente de monedas base. Re-ejecutable sin efectos colaterales.
INSERT INTO currencies (id, code, name, symbol, isBase, createdAt, updatedAt)
VALUES
  (UUID(), 'COP', 'Peso colombiano', '$',  1, NOW(3), NOW(3)),
  (UUID(), 'USD', 'Dólar americano', 'US$', 0, NOW(3), NOW(3)),
  (UUID(), 'EUR', 'Euro',            '€',   0, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  name      = VALUES(name),
  symbol    = VALUES(symbol),
  updatedAt = NOW(3);
-- Nota: isBase NO se sobreescribe en el UPDATE para no pisar una base
-- configurada manualmente desde la UI. La inserción inicial fija COP como base.
```
Notas:
- `code` es `@unique` → el `ON DUPLICATE KEY` evita duplicados.
- `id` usa `UUID()` solo en el INSERT inicial (Prisma usa `cuid()` en runtime; el id generado en SQL es válido como PK string y solo aplica a filas nuevas).
- No incluye `ExchangeRate` — las tasas se cargan desde la UI (historial manual).
- Alternativa equivalente: `prisma db seed` si el seed existente ya cubre estas 3 monedas (lo hace), pero el SQL es preferible en producción por ser quirúrgico e idempotente sin tocar el resto del seed.

---

## Próximos pasos

- `sdd-spec` y `sdd-design` pueden ejecutarse en paralelo a partir de esta propuesta.
- `sdd-spec`: contratos de Server Actions, DTOs, schemas Yup, criterios de aceptación.
- `sdd-design`: decisiones de transacción para `isBase`, mapeo de `Decimal`, estrategia de paginación por tab.
