# Módulo de Depreciación — Novahold Inventory ERP

Documentación técnica y funcional del sistema de depreciación de activos: cálculo, snapshots anuales, conversión de monedas y visualización en analytics.

---

## Índice

1. [Conceptos](#1-conceptos)
2. [Método de cálculo](#2-método-de-cálculo)
3. [Conversión de monedas](#3-conversión-de-monedas)
4. [Cálculo en tiempo real vs snapshots](#4-cálculo-en-tiempo-real-vs-snapshots)
5. [Generación de cortes anuales](#5-generación-de-cortes-anuales)
6. [Modelo de datos](#6-modelo-de-datos)
7. [Analytics — pestaña Financiero](#7-analytics--pestaña-financiero)
8. [Archivos clave](#8-archivos-clave)

---

## 1. Conceptos

### ¿Qué es la depreciación en este contexto?

La depreciación representa la pérdida de valor de un activo a lo largo del tiempo. Para efectos contables y de reporte financiero, el sistema calcula cuánto vale cada activo en libros en un momento dado.

### Campos del activo relevantes

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `purchasePriceBase` | `Decimal(15,2)` | Precio de compra en COP (base de cálculo) |
| `purchasePrice` | `Decimal(15,2)?` | Precio original en la moneda de compra |
| `currencyCode` | `String?` | Moneda de compra (`COP`, `USD`, `EUR`, etc.) |
| `salvageValue` | `Decimal(15,2)?` | Valor residual al final de la vida útil (COP) |
| `usefulLifeYears` | `Int?` | Vida útil en años |
| `purchaseDate` | `DateTime?` | Fecha de adquisición — punto de inicio del cálculo |

Un activo es elegible para depreciación cuando tiene los cuatro campos: `purchasePriceBase`, `salvageValue`, `usefulLifeYears` y `purchaseDate`.

---

## 2. Método de cálculo

### Línea recta (NIIF / IFRS)

```
Depreciación anual     = (purchasePriceBase − salvageValue) / usefulLifeYears
Depreciación acumulada = min(depAnual × añosTranscurridos, purchasePriceBase − salvageValue)
Valor en libros        = purchasePriceBase − depreciacionAcumulada
```

### Función `calculateDepreciation()`

Archivo: `src/lib/depreciation.ts`

```typescript
calculateDepreciation(
  purchasePriceBase: number,
  salvageValue: number,
  usefulLifeYears: number,
  purchaseDate: Date | null,
  asDate?: Date,       // si se omite, usa new Date() (hoy)
): DepreciationResult
```

Retorna:

```typescript
{
  annualDepr: number,      // depreciación anual en COP
  accumulated: number,     // depreciación acumulada hasta asDate
  bookValue: number,       // valor en libros en asDate
  yearsElapsed: number,    // años transcurridos (entero, truncado)
}
```

### Ejemplo

```
Laptop comprada en:  2022-01-01
Precio base COP:     5 000 000
Valor residual COP:  500 000
Vida útil:           5 años
Referencia (asDate): 2025-01-01

Depreciación anual     = (5 000 000 − 500 000) / 5 = 900 000 COP/año
Años transcurridos     = 3
Depreciación acumulada = 900 000 × 3 = 2 700 000 COP
Valor en libros        = 5 000 000 − 2 700 000 = 2 300 000 COP
```

### Comportamiento en casos borde

| Caso | Resultado |
|------|-----------|
| `purchaseDate = null` | `accumulated = 0`, `bookValue = purchasePriceBase` |
| `usefulLifeYears = 0` | `annualDepr = 0` |
| `accumulated > purchasePriceBase − salvageValue` | Se capea en `purchasePriceBase − salvageValue` |
| `asDate < purchaseDate` | `yearsElapsed = 0`, `accumulated = 0` |

---

## 3. Conversión de monedas

### Flujo de conversión al crear/editar un activo

Cuando un activo se registra con `currencyCode != 'COP'`, el sistema calcula `purchasePriceBase` usando la tasa histórica más cercana a `purchaseDate`:

```
createAssetAction recibe:
  purchasePrice = 1 200   (USD)
  currencyCode  = 'USD'
  purchaseDate  = '2024-03-15'
        │
        ▼
computePurchasePriceBase(tx, 1200, 'USD', '2024-03-15'):
  1. currency.findUnique({ code: 'USD' })       → currencyId = 'xxx'
  2. exchangeRate.findFirst({
       currencyId: 'xxx',
       effectiveDate ≤ '2024-03-15',
       ORDER BY effectiveDate DESC
     })                                         → rateToBase = 4 050.00
  3. purchasePriceBase = 1 200 × 4 050 = 4 860 000 COP
        │
        ▼
asset.create({
  purchasePrice: 1200,
  currencyCode: 'USD',
  purchasePriceBase: 4860000,   ← base de cálculo fija en COP
  ...
})
```

**Punto clave**: `purchasePriceBase` se fija en el momento de creación usando la TRM del día de compra. Cambios futuros en la TRM NO afectan el valor base del activo.

### ¿Y si no hay tasa para esa fecha?

Si `exchangeRate.findFirst` no encuentra ninguna tasa en o antes de `purchaseDate`, el precio se guarda sin conversión (`purchasePriceBase = purchasePrice`). Este es un caso raro que se previene registrando tasas históricas en `settings/currencies` antes de importar activos.

---

## 4. Cálculo en tiempo real vs snapshots

El sistema tiene dos caminos para la depreciación:

### Camino 1: Cálculo en tiempo real

Usado por:
- **Vista de detalle del activo** (`/assets/NVH-PC-00001`) — tabla año a año calculada al cargar
- **Exportación XLSX** (`exportDepreciationAction`) — genera el Excel con valores al día de hoy

Ventaja: siempre actualizado. Desventaja: no persiste — no sirve para auditoría ni para el dashboard de analytics.

### Camino 2: Snapshots anuales (persistidos)

Usado por:
- **Analytics → pestaña Financiero** — lee de `depreciation_snapshots`
- **Auditoría contable** — registro inmutable del valor al cierre del año

**Estado actual**: la tabla `depreciation_snapshots` se llena ejecutando `generateDepreciationSnapshotsAction(year)` manualmente (botón "Corte anual" en la tabla de activos). No hay cron automático.

---

## 5. Generación de cortes anuales

### Desde la UI

1. Navegar a `/assets`
2. Clic en **"Corte anual"** (visible solo para ADMIN y SUPER_ADMIN)
3. Confirmar en el diálogo — el año propuesto es el año actual
4. Toast de confirmación: `"Corte 2025 generado: 47 activos procesados."`

### Qué hace internamente `generateDepreciationSnapshotsAction(year)`

```
1. Autenticación: requiere rol con permiso assets:create

2. Calcula snapshotDate = 31-Dic-{year} 00:00:00 UTC

3. Consulta todos los activos activos con:
   - purchasePriceBase NOT NULL
   - usefulLifeYears NOT NULL
   - purchaseDate NOT NULL

4. Pre-fetcha tasas de cambio al 31-Dic:
   - Por cada currencyCode distinto != 'COP'
   - exchangeRate más reciente en o antes de snapshotDate
   - Guarda en mapa: currencyCode → tasa

5. Por cada activo:
   - calculateDepreciation(base, salvage, years, purchaseDate, snapshotDate)
   - Si moneda != COP → exchangeRateUsed = tasa del mapa (null si no hay)
   - bookValue ≤ salvageValue → isFullyDepreciated = true

6. $transaction([
     depreciationSnapshot.deleteMany({ where: { snapshotDate } }),
     depreciationSnapshot.createMany({ data: snapshots }),
   ])
   ← Idempotente: re-ejecutar el mismo año reemplaza los valores

7. revalidatePath('/analytics') + revalidatePath('/assets')
```

### Idempotencia

Re-ejecutar el corte del mismo año **borra y recrea** las filas para ese `snapshotDate`. Esto permite corregir un corte si se agregaron activos o se corrigieron tasas de cambio después de generarlo.

### ¿Cuándo ejecutarlo?

- Al cierre del año fiscal (31-Dic)
- Después de cargar activos masivamente con fecha de compra retroactiva
- Cuando el dashboard de analytics muestre ceros en Depreciación Acumulada / Valor Libro

---

## 6. Modelo de datos

### `DepreciationSnapshot`

```prisma
model DepreciationSnapshot {
  id                  String   @id @default(cuid())
  assetId             String
  asset               Asset    @relation(...)
  snapshotDate        DateTime             // siempre 31-Dic del año
  bookValueBase       Decimal  @db.Decimal(15, 2)   // valor en libros COP
  accumulatedDeprBase Decimal  @db.Decimal(15, 2)   // depreciación acumulada COP
  annualDeprBase      Decimal  @db.Decimal(15, 2)   // depreciación del año COP
  exchangeRateUsed    Decimal? @db.Decimal(18, 6)   // TRM al 31-Dic (solo si moneda != COP)
  isFullyDepreciated  Boolean  @default(false)       // bookValue <= salvageValue
  createdAt           DateTime @default(now())

  @@index([assetId, snapshotDate])
  @@map("depreciation_snapshots")
}
```

### Significado de `exchangeRateUsed`

Es la tasa COP/moneda-original vigente al **31 de diciembre del año del corte** — NO la tasa del día de compra.

Por ejemplo, si un activo se compró con USD y se genera el corte 2025:
- `purchasePriceBase` = precio fijado en 2022 con TRM del día de compra
- `exchangeRateUsed` = TRM del 31-Dic-2025

Esto permite a contabilidad expresar el valor en libros en la moneda original si lo necesita: `bookValueBase / exchangeRateUsed`.

### Relación con la tabla `Asset`

```
Asset (1) ──────────────────── (N) DepreciationSnapshot
              un snapshot por año
```

Un activo puede tener un snapshot por cada año fiscal desde su año de compra.

---

## 7. Analytics — pestaña Financiero

### KPIs que dependen de snapshots

| KPI | Query | Fuente |
|-----|-------|--------|
| Depreciación Acumulada | `SUM(accumulatedDeprBase)` del snapshot más reciente por activo | `depreciation_snapshots` |
| Valor Libro Total | `SUM(bookValueBase)` del snapshot más reciente por activo | `depreciation_snapshots` |
| Valor Total (costo) | `SUM(purchasePriceBase)` | tabla `assets` directamente |

**Importante**: si la tabla `depreciation_snapshots` está vacía, los KPIs de depreciación muestran `0`. El KPI de "Valor Total" siempre tiene datos porque lee de `assets`.

### `DepreciationAreaChart`

Muestra la evolución año a año del valor en libros acumulado. Requiere al menos un snapshot por año para dibujar la línea. Muestra el estado vacío `"Sin snapshots de depreciación"` si la tabla está vacía.

### Cuándo se actualiza el dashboard

`generateDepreciationSnapshotsAction` llama `revalidatePath('/analytics')` al finalizar, por lo que el dashboard se refresca en la siguiente visita sin necesidad de deploy ni de refrescar manualmente.

---

## 8. Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/depreciation.ts` | `calculateDepreciation()` — lógica pura sin side effects |
| `src/lib/__tests__/depreciation.test.ts` | Tests unitarios de la función |
| `src/app/(dashboard)/assets/actions.ts` | `generateDepreciationSnapshotsAction()`, `exportDepreciationAction()`, `computePurchasePriceBase()` |
| `src/app/(dashboard)/assets/__tests__/actions.test.ts` | Tests de los Server Actions de depreciación |
| `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` | Botón "Corte anual" |
| `src/app/(dashboard)/assets/[assetCode]/presentation/AssetDetailView.tsx` | Tabla de depreciación año a año (tiempo real) |
| `src/app/(dashboard)/analytics/actions.ts` | `getFinancieroDataAction()` — lee de `depreciation_snapshots` |
| `src/app/(dashboard)/analytics/presentation/` | `FinancieroTab.tsx`, `DepreciationAreaChart.tsx` |
| `prisma/schema.prisma` | Modelo `DepreciationSnapshot` |

---

## Preguntas frecuentes

**¿Por qué los KPIs de depreciación muestran 0?**
La tabla `depreciation_snapshots` está vacía. Ir a `/assets` → botón "Corte anual" → confirmar con el año actual.

**¿Puedo volver a generar el corte de un año ya procesado?**
Sí. La operación es idempotente: borra las filas del mismo `snapshotDate` y las recrea con los valores actuales.

**¿El corte afecta activos desactivados (`isActive = false`)?**
No. Solo procesa activos con `isActive = true`.

**¿Qué pasa si un activo no tiene `purchaseDate` o `usefulLifeYears`?**
Se omite del corte (el `findMany` filtra `purchaseDate: { not: null }` y `usefulLifeYears: { not: null }`). No se genera error — simplemente ese activo no tiene snapshot.

**¿Se crean snapshots retroactivos para años anteriores?**
No automáticamente. Hay que llamar `generateDepreciationSnapshotsAction(año)` para cada año que se quiera. Por ejemplo, para tener series 2022-2025 hay que ejecutar el botón cuatro veces cambiando el año (actualmente el botón usa el año actual — para años anteriores se haría vía código o agregando un picker de año a la UI).
