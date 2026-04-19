# Proposal: Analytics / KPI Dashboard

## Intent

El sistema tiene datos ricos en 17 modelos Prisma (activos, asignaciones, movimientos, depreciación, empleados) pero ninguna superficie de análisis. Operadores y gerentes no pueden ver el estado del inventario de un vistazo ni tomar decisiones basadas en datos sin consultar la DB directamente.

## Scope

### In Scope
- Dashboard en `/analytics` con 4 tabs: Inventario, Financiero, Asignaciones, Movimientos
- KPI cards numéricas por tab (4 métricas clave cada uno)
- 9 gráficos con shadcn/ui Charts (Recharts)
- Server Actions para queries de agregación por dominio
- Entrada en el sidebar de navegación
- Protección por rol: `assets:read` mínimo (VIEWER en adelante)

### Out of Scope
- Filtros de fecha interactivos (primera versión con datos históricos completos)
- Export PDF/Excel del dashboard
- Alertas o notificaciones basadas en KPIs
- Dashboard personalizable por usuario

## Capabilities

### New Capabilities
- `analytics-dashboard`: Dashboard ejecutivo con KPIs de inventario, finanzas, asignaciones y movimientos de activos

### Modified Capabilities
- None

## Approach

Server Component `page.tsx` ejecuta 4 queries Prisma en paralelo (`Promise.all`), una por dominio. Pasa los resultados como props a `AnalyticsDashboard` (Client Component) que renderiza `<Tabs>` de shadcn. Cada tab monta sus KpiCards + chart components puros (data in → chart out). Usa `$queryRaw` solo para agrupaciones por fecha (MySQL `DATE_FORMAT`); el resto usa `prisma.xxx.groupBy` o `aggregate`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/(dashboard)/analytics/` | New | Módulo completo: page, actions, presentation |
| `src/components/ui/chart.tsx` | New | shadcn chart component (instalado vía CLI) |
| `src/components/dashboard/sidebar-nav-config.ts` | Modified | Agregar ítem "Analytics" |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `$queryRaw` frágil ante cambios de schema | Low | Limitar raw queries solo a groupBy por fecha |
| DB sin datos de prueba → charts vacíos | Med | Seed ya existente; charts muestran estado vacío gracefully |
| Recharts bundle size | Low | Tree-shaking automático vía shadcn chart wrapper |

## Rollback Plan

Eliminar `src/app/(dashboard)/analytics/` y revertir el ítem en `sidebar-nav-config.ts`. No hay migraciones de DB ni cambios destructivos.

## Dependencies

- `pnpm dlx shadcn@latest add chart` — instala `chart.tsx` con Recharts
- `pnpm dlx shadcn@latest add tabs` — si no está instalado ya

## Success Criteria

- [ ] `/analytics` carga sin errores con data real de la DB
- [ ] 4 tabs navegan correctamente
- [ ] KPI cards muestran valores correctos
- [ ] Todos los charts renderizan (o muestran estado vacío si no hay data)
- [ ] VIEWER puede ver el dashboard; rutas sin sesión redirigen a `/`
