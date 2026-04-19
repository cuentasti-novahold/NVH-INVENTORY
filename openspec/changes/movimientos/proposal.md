# Proposal: Módulo de Traslados de Activos (Kardex)

## Intent

El negocio carece de trazabilidad física de activos: cuando un equipo se traslada entre sedes o bodegas, solo cambia `Asset.locationId`/`bodegaId` sin dejar historial estructurado. Imposible responder "¿dónde ha estado este activo?" ni "¿quién autorizó el traslado del 15-Mar?". Se requiere un **Kardex**: registro perpetuo de cada movimiento físico.

## Scope

### In Scope
- Modelo `AssetMovement` en Prisma con tipos RELOCATION | LOAN | REPAIR | RETURN_FROM_REPAIR | AUDIT
- Al registrar un traslado: `$transaction` atómico que mueve el activo y crea el registro en un solo paso
- Módulo `/movimientos` — lista paginada con filtros por tipo
- Kardex por activo vía `?assetId=xxx` (banner + historial filtrado)
- Permisos: ADMIN/SUPER_ADMIN escriben y eliminan; MANAGER/TECHNICIAN crean; VIEWER solo lee
- Link "Traslados" en sidebar OPERACIONES

### Out of Scope
- Flujo de aprobación multi-paso (PENDING → APPROVED → IN_TRANSIT)
- Notificaciones de traslado pendiente
- Reporte PDF/Excel de Kardex

## Capabilities

### New Capabilities
- `asset-movements`: Registro y consulta de movimientos físicos de activos entre sedes y bodegas

### Modified Capabilities
None

## Approach

Replicar el stack DDD de `assignments` (DTO → Mapper → Yup → Server Actions → Hook → XxxTablePage → page.tsx). Excepción: el formulario de creación usa `react-hook-form` directo (sin `CrudFormDialog`) por necesitar efectos inter-campo (auto-fill "Desde" al seleccionar activo, filtro de bodegas por ubicación destino).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Nuevo enum `MovementType` + modelo `AssetMovement` + back-relations |
| `src/lib/permissions.ts` | Modified | Recurso `movements` con permisos por rol |
| `src/components/dashboard/sidebar-nav-config.ts` | Modified | Link "Traslados" con `ArrowRightLeft` |
| `src/app/(dashboard)/assets/actions.ts` | Modified | Agregar `getAssetLocationAction` |
| `src/app/(dashboard)/settings/locations/actions.ts` | Modified | Agregar `searchBodegasByLocationAction` |
| `src/app/(dashboard)/movimientos/` | New | Módulo completo (actions, page, presentación) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Race condition: dos traslados simultáneos del mismo activo | Low | `$transaction` atómico; el segundo falla con error DB |
| `mode: 'insensitive'` incompatible con MariaDB | Low | Nunca usar `mode`; MariaDB usa collation CI por defecto |
| Back-relations nombradas en Prisma (Location/Bodega con múltiples FKs a AssetMovement) | Low | Nombrar todas las relaciones (`"MovementsFrom"`, `"MovementsTo"`, etc.) |

## Rollback Plan

`npx prisma migrate dev --name revert_asset_movements` aplicando un `DROP TABLE asset_movements` + eliminar el enum y las back-relations del schema. Los datos de `Asset.locationId`/`bodegaId` no se alteran.

## Dependencies

- `prisma migrate dev` antes de cualquier código de aplicación

## Success Criteria

- [ ] Registrar traslado crea `AssetMovement` record y actualiza `Asset.locationId` + `Asset.bodegaId` en un solo paso atómico
- [ ] `/movimientos?assetId=X` muestra historial completo del activo en orden cronológico inverso
- [ ] VIEWER no ve el botón "Registrar traslado" (`canWrite=false`)
- [ ] MANAGER no ve el botón eliminar (`canDelete=false`)
- [ ] `pnpm test:unit` pasa con 0 fallos
