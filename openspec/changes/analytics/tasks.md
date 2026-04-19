# Tasks: Analytics / KPI Dashboard

## Phase 1: Foundation

- [x] T-01 Instalar shadcn chart: `pnpm dlx shadcn@latest add chart` → verifica que `src/components/ui/chart.tsx` existe
- [x] T-02 Crear `src/app/(dashboard)/analytics/presentation/dto/analytics.dto.ts` — interfaces: `ChartEntry`, `TimeSeriesEntry`, `InventarioData`, `FinancieroData`, `AsignacionesData`, `MovimientosData`
- [x] T-03 Modificar `src/components/dashboard/sidebar-nav-config.ts` — agregar `{ href: '/analytics', label: 'Analítica', icon: BarChart2 }` en sección OPERACIONES (importar `BarChart2` de lucide-react)

## Phase 2: Server Actions

- [x] T-04 Crear `src/app/(dashboard)/analytics/actions.ts` con `getInventarioDataAction()` — `aggregate` total assets, count categorías, `groupBy isActive`, `groupBy categoryId` (join name), `groupBy functionalStatus`, `groupBy locationId` (join name) — retorna `InventarioData`
- [x] T-05 Agregar `getFinancieroDataAction()` en `actions.ts` — `aggregate` sum `purchasePriceBase`, query latest `DepreciationSnapshot` por asset (sum `bookValueBase` y `accumulatedDeprBase`), top 10 assets por `purchasePriceBase` — retorna `FinancieroData`
- [x] T-06 Agregar `getAsignacionesDataAction()` en `actions.ts` — count por `AssignmentStatus`, count assets activos sin assignment ACTIVE (subquery), `groupBy employeeId` top 10 (join `employee.fullName`) — retorna `AsignacionesData`
- [x] T-07 Agregar `getMovimientosDataAction()` en `actions.ts` — count total, count `movedAt >= startOfMonth`, `groupBy movementType`, `$queryRaw` para timeline mensual últimos 6 meses con `DATE_FORMAT` — retorna `MovimientosData`

## Phase 3: Chart Components

- [x] T-08 Crear `charts/AssetsByCategoryChart.tsx` — `PieChart` shadcn, prop `data: ChartEntry[]`, empty state si `data.length === 0`
- [x] T-09 Crear `charts/FunctionalStatusChart.tsx` — `BarChart` shadcn vertical, prop `data: ChartEntry[]`
- [x] T-10 Crear `charts/AssetsByLocationChart.tsx` — `BarChart` shadcn horizontal (`layout="vertical"`), prop `data: ChartEntry[]`
- [x] T-11 Crear `charts/DepreciationAreaChart.tsx` — `AreaChart` shadcn, prop `data: TimeSeriesEntry[]`, series: `valorLibro` y `depreciacionAcumulada`
- [x] T-12 Crear `charts/TopAssetsByValueChart.tsx` — `BarChart` horizontal, prop `data: ChartEntry[]`, top 10
- [x] T-13 Crear `charts/AssignmentsPieChart.tsx` — `PieChart`, prop `data: ChartEntry[]` (Asignados/Disponibles)
- [x] T-14 Crear `charts/TopEmployeesChart.tsx` — `BarChart` horizontal, prop `data: ChartEntry[]`, top 10
- [x] T-15 Crear `charts/MovementsTimelineChart.tsx` — `BarChart` grouped por tipo, prop `data: TimeSeriesEntry[]`
- [x] T-16 Crear `charts/MovementsByTypeChart.tsx` — `PieChart`, prop `data: ChartEntry[]`

## Phase 4: KpiCard + Tab Components

- [x] T-17 Crear `components/KpiCard.tsx` — props: `label: string`, `value: string | number`, `suffix?: string`, `icon?: LucideIcon` — card con valor grande y label chico
- [x] T-18 Crear `tabs/InventarioTab.tsx` — 4 KpiCards + `AssetsByCategoryChart` + `FunctionalStatusChart` + `AssetsByLocationChart`, props: `InventarioData`
- [x] T-19 Crear `tabs/FinancieroTab.tsx` — 3 KpiCards + `DepreciationAreaChart` + `TopAssetsByValueChart`, props: `FinancieroData`
- [x] T-20 Crear `tabs/AsignacionesTab.tsx` — 4 KpiCards + `AssignmentsPieChart` + `TopEmployeesChart`, props: `AsignacionesData`
- [x] T-21 Crear `tabs/MovimientosTab.tsx` — 3 KpiCards + `MovementsTimelineChart` + `MovementsByTypeChart`, props: `MovimientosData`

## Phase 5: Integration

- [x] T-22 Crear `components/AnalyticsDashboard.tsx` — `"use client"`, `<Tabs>` shadcn con 4 `<TabsTrigger>` y 4 `<TabsContent>`, monta los 4 XxxTab con sus props
- [x] T-23 Crear `src/app/(dashboard)/analytics/page.tsx` — Server Component, `auth()` + `hasPermission(role, 'assets', 'read')`, `redirect('/')` si falla, `Promise.all` de 4 actions, renderiza `<AnalyticsDashboard />`
