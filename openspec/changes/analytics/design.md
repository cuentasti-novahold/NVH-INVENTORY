# Design: Analytics / KPI Dashboard

## Technical Approach

Server Component `page.tsx` ejecuta 4 Server Actions en paralelo con `Promise.all`. Los datos llegan como props a `AnalyticsDashboard` (Client Component) que orquesta los `<Tabs>` de shadcn. Cada tab es un componente separado que compone `KpiCard` + chart components puros. Los charts usan `shadcn/ui chart` (wrapper de Recharts). Sin Route Handlers, sin client-side fetching.

## Architecture Decisions

### Decision: Fetch server-side vs client-side

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Server-side (page.tsx) | Sin loading spinners por dominio, TTI más alto pero UX limpia | ✅ Elegida |
| Client-side por tab | Lazy loading por tab, más complejo, requiere Route Handlers | ❌ Rechazada |

**Rationale**: Los datos son de solo lectura, el módulo assets usa el mismo patrón, y evita complejidad de Route Handlers sin beneficio real.

### Decision: $queryRaw solo para agrupación por fecha

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| `prisma.xxx.groupBy` para todo | Type-safe, pero no soporta `DATE_FORMAT` | Parcial |
| `$queryRaw` para groupBy fecha | Frágil a renames de campo, pero necesario para MySQL | ✅ Solo para timeline mensual |

**Rationale**: Minimizar superficie de raw SQL. Solo `movimientos timeline` y `depreciación trend` necesitan agrupar por mes.

### Decision: KpiCard component reutilizable

Un solo `KpiCard.tsx` con props `{ label, value, suffix?, icon? }` usado por los 4 tabs. Evita duplicación, fácil de mantener.

## Data Flow

```
Browser → GET /analytics
               ↓
         page.tsx (Server Component)
         auth() + hasPermission()
               ↓
         Promise.all([
           getInventarioDataAction(),
           getFinancieroDataAction(),
           getAsignacionesDataAction(),
           getMovimientosDataAction()
         ])
               ↓
         <AnalyticsDashboard {...data} />  (Client)
               ↓
         <Tabs defaultValue="inventario">
           <InventarioTab /> | <FinancieroTab />
           <AsignacionesTab /> | <MovimientosTab />
```

## File Changes

| File | Acción | Descripción |
|------|--------|-------------|
| `src/app/(dashboard)/analytics/page.tsx` | Create | Server Component: auth, Promise.all, props |
| `src/app/(dashboard)/analytics/actions.ts` | Create | 4 server actions de lectura |
| `src/app/(dashboard)/analytics/presentation/dto/analytics.dto.ts` | Create | InventarioData, FinancieroData, AsignacionesData, MovimientosData |
| `src/app/(dashboard)/analytics/presentation/components/AnalyticsDashboard.tsx` | Create | "use client", Tabs de shadcn |
| `src/app/(dashboard)/analytics/presentation/components/KpiCard.tsx` | Create | Card métrica numérica reutilizable |
| `src/app/(dashboard)/analytics/presentation/components/tabs/InventarioTab.tsx` | Create | Tab inventario |
| `src/app/(dashboard)/analytics/presentation/components/tabs/FinancieroTab.tsx` | Create | Tab financiero |
| `src/app/(dashboard)/analytics/presentation/components/tabs/AsignacionesTab.tsx` | Create | Tab asignaciones |
| `src/app/(dashboard)/analytics/presentation/components/tabs/MovimientosTab.tsx` | Create | Tab movimientos |
| `src/app/(dashboard)/analytics/presentation/components/charts/AssetsByCategoryChart.tsx` | Create | PieChart shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/FunctionalStatusChart.tsx` | Create | BarChart shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/AssetsByLocationChart.tsx` | Create | BarChart horizontal shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/DepreciationAreaChart.tsx` | Create | AreaChart shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/TopAssetsByValueChart.tsx` | Create | BarChart horizontal shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/AssignmentsPieChart.tsx` | Create | PieChart shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/TopEmployeesChart.tsx` | Create | BarChart horizontal shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/MovementsTimelineChart.tsx` | Create | BarChart grouped shadcn |
| `src/app/(dashboard)/analytics/presentation/components/charts/MovementsByTypeChart.tsx` | Create | PieChart shadcn |
| `src/components/ui/chart.tsx` | Create (CLI) | `pnpm dlx shadcn@latest add chart` |
| `src/components/dashboard/sidebar-nav-config.ts` | Modify | Agregar `{ href: '/analytics', label: 'Analítica', icon: BarChart2 }` en OPERACIONES |

## Interfaces / Contracts

```typescript
// analytics.dto.ts
export interface ChartEntry { label: string; value: number }
export interface TimeSeriesEntry { month: string; [key: string]: string | number }

export interface InventarioData {
  kpis: { total: number; categorias: number; activos: number; inactivos: number }
  byCategory: ChartEntry[]
  byStatus: ChartEntry[]
  byLocation: ChartEntry[]
}
export interface FinancieroData {
  kpis: { valorTotal: number; depreciacionAcumulada: number; valorLibro: number }
  depreciationTrend: TimeSeriesEntry[]
  topAssets: ChartEntry[]
}
export interface AsignacionesData {
  kpis: { activas: number; disponibles: number; retornadas: number; tasaUtilizacion: number }
  distribution: ChartEntry[]
  topEmployees: ChartEntry[]
}
export interface MovimientosData {
  kpis: { total: number; esteMes: number; tipoMasFrecuente: string }
  timeline: TimeSeriesEntry[]
  byType: ChartEntry[]
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Actions (aggregation logic) | Vitest + mocked Prisma si existe test suite |
| Visual | Charts | Manual QA en dev server |
| E2E | Tab navigation, KPI values | Manual QA |

## Migration / Rollout

No migration required. Sin cambios de schema, sin datos nuevos, sin feature flags.

## Open Questions

- None
