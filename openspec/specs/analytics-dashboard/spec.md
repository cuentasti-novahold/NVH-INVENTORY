# Analytics Dashboard Specification

## Purpose

Provide an executive KPI dashboard at `/analytics` that aggregates inventory, financial, assignment, and movement data into readable metrics and charts. No DB access required by users — data is pre-computed server-side.

## Requirements

### Requirement: Dashboard Access Control

The system MUST restrict access to `/analytics` to authenticated users with the `assets:read` permission. Unauthenticated requests MUST redirect to `/`.

#### Scenario: Authenticated user with read permission

- GIVEN a user with role VIEWER or higher is authenticated
- WHEN they navigate to `/analytics`
- THEN the dashboard loads with all 4 tabs visible

#### Scenario: Unauthenticated access

- GIVEN no active session exists
- WHEN `/analytics` is requested
- THEN the system redirects to `/`

### Requirement: Tab Navigation

The system MUST display 4 tabs: **Inventario**, **Financiero**, **Asignaciones**, **Movimientos**. Only one tab is active at a time. The default active tab is **Inventario**.

#### Scenario: Tab switching

- GIVEN the dashboard is loaded on the Inventario tab
- WHEN the user clicks the Financiero tab
- THEN the Financiero content replaces Inventario content without page reload

### Requirement: Inventario Tab KPIs

The system MUST display: total activos, total categorías, activos activos, activos inactivos. The system MUST render: activos por categoría (pie), estado funcional (bar), activos por ubicación (bar horizontal).

#### Scenario: Data present

- GIVEN assets exist in the database
- WHEN the Inventario tab is active
- THEN 4 KPI cards show correct counts and all 3 charts render with labeled data

#### Scenario: No assets

- GIVEN no assets exist
- WHEN the Inventario tab is active
- THEN KPI cards show 0 and charts show an empty state message

### Requirement: Financiero Tab KPIs

The system MUST display: valor total inventario (COP), depreciación acumulada, valor libro total. The system MUST render: tendencia valor libro vs depreciación (area chart), top 10 activos por valor (bar horizontal).

#### Scenario: Depreciation snapshots exist

- GIVEN DepreciationSnapshot records exist
- WHEN the Financiero tab is active
- THEN the area chart shows the depreciation trend over time with correct COP values

#### Scenario: No snapshots

- GIVEN no DepreciationSnapshot records exist
- WHEN the Financiero tab is active
- THEN financial KPIs derive from Asset.purchasePriceBase and the area chart shows empty state

### Requirement: Asignaciones Tab KPIs

The system MUST display: asignaciones activas, activos disponibles (activos sin assignment ACTIVE), retornadas, tasa de utilización (%). The system MUST render: distribución asignados vs disponibles (pie), top 10 empleados con más activos (bar horizontal).

#### Scenario: Active assignments exist

- GIVEN Assignment records with status ACTIVE exist
- WHEN the Asignaciones tab is active
- THEN utilization rate = (activas / total activos) * 100, rounded to 1 decimal

### Requirement: Movimientos Tab KPIs

The system MUST display: total movimientos, movimientos este mes, tipo más frecuente. The system MUST render: movimientos por mes agrupado por tipo (bar chart, últimos 6 meses), distribución por tipo (pie).

#### Scenario: Movements in current month

- GIVEN AssetMovement records exist with movedAt in the current calendar month
- WHEN the Movimientos tab is active
- THEN "Movimientos este mes" reflects the accurate count for the current month

#### Scenario: No movements

- GIVEN no AssetMovement records exist
- WHEN the Movimientos tab is active
- THEN KPI cards show 0, tipo más frecuente shows "—", charts show empty state

### Requirement: Server-Side Data Fetch

The system MUST fetch all 4 tab datasets in parallel on the server before rendering. The page MUST NOT make client-side API calls to load chart data.

#### Scenario: Parallel fetch

- GIVEN the server receives a request to `/analytics`
- WHEN the page renders
- THEN all 4 domain queries execute concurrently via Promise.all and results are passed as props
