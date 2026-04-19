# Tasks: Módulo de Traslados de Activos (Kardex)

**STRICT TDD MODE IS ACTIVE.** Test runner: `pnpm test:unit`.

## TDD Ordering Rule
Para cada archivo no-trivial:
1. Escribe el test → `pnpm test:unit` → confirma RED
2. Escribe la implementación → `pnpm test:unit` → confirma GREEN

---

## Phase 1: Foundation (T-00 → T-06)

- [ ] T-00 Verificar baseline: ejecutar `pnpm test:unit` y anotar total de tests (debe ser 218, 0 fallos)
- [ ] T-01 `prisma/schema.prisma` — agregar enum `MovementType` + model `AssetMovement` + back-relations en Asset, Location, Bodega, User (relaciones nombradas obligatorias)
- [ ] T-02 Ejecutar `npx prisma migrate dev --name add_asset_movements` + `npx prisma generate`
- [ ] T-03 `src/lib/permissions.ts` — agregar `'movements'` al tipo `Resource` y entradas por rol (ADMIN:*, MANAGER:read+create, TECHNICIAN:read+create, VIEWER:read)
- [ ] T-04 `src/components/dashboard/sidebar-nav-config.ts` — agregar `{ href: '/movimientos', label: 'Traslados', icon: ArrowRightLeft }` en OPERACIONES
- [ ] T-05 `src/app/(dashboard)/assets/actions.ts` — agregar `getAssetLocationAction(assetId)` (findUnique + select location + bodega names)
- [ ] T-06 `src/app/(dashboard)/settings/locations/actions.ts` — agregar `searchBodegasByLocationAction(locationId)` (findMany filtrado por locationId, sin `mode: 'insensitive'`)

---

## Phase 2: Backend con TDD (T-07 → T-17)

- [ ] T-07 RED: Escribir tests de `toMovementRow` en `__tests__/actions.test.ts` — mapeo correcto, fromLocation null, assetLabel fallback
- [ ] T-08 GREEN: Crear `presentation/dto/movement.dto.ts` (`MovementRow`, `CreateMovementDTO`) y `presentation/mappers/movement.mapper.ts` (`toMovementRow` + `movementInclude`)
- [ ] T-09 RED: Escribir tests de `listMovementsAction` — FORBIDDEN (null session), ADMIN ve todos, filtro por tipo, filtro por assetId (Kardex)
- [ ] T-10 GREEN: Crear `movimientos/actions.ts` con `listMovementsAction` (paginación, filtros por movementType y assetId, orden movedAt desc)
- [ ] T-11 RED: Escribir tests de `createMovementAction` — UNAUTHORIZED, VIEWER→FORBIDDEN, VALIDATION(assetId vacío), VALIDATION(toLocationId vacío), VALIDATION(tipo inválido), éxito→$transaction 3 pasos, revalidatePath x2, UNKNOWN en error DB
- [ ] T-12 GREEN: Agregar `createMovementAction` a `actions.ts` con `$transaction([assetMovement.create, asset.update, auditLog.create])`
- [ ] T-13 RED: Escribir tests de `deleteMovementAction` — UNAUTHORIZED, VIEWER→FORBIDDEN, MANAGER→FORBIDDEN, NOT_FOUND(P2025), éxito ADMIN, revalidatePath
- [ ] T-14 GREEN: Agregar `deleteMovementAction` a `actions.ts`
- [ ] T-15 GREEN: Crear `presentation/schemas/movement.schema.ts` — Yup schema para `CreateMovementDTO` (assetId required, toLocationId required, movementType oneOf enum)
- [ ] T-16 Ejecutar `pnpm test:unit` — confirmar todos los tests del módulo en GREEN antes de continuar
- [ ] T-17 Agregar `searchMovementsAction` opcional en `actions.ts` si se necesita para autocomplete (puede diferirse)

---

## Phase 3: Presentación (T-18 → T-24)

- [ ] T-18 Crear `presentation/hooks/use-movimientos.ts` — `useMovimientos()` con `create(dto, onSuccess)` y `remove(id, onSuccess)` usando `useTransition`
- [ ] T-19 Crear `presentation/forms/movement-form.config.ts` — constantes `MOVEMENT_TYPE_OPTIONS` (labels en español) y tipos para el form
- [ ] T-20 Crear `presentation/components/columns-movimientos.tsx` — columnas TanStack con `MovementTypeBadge` (colores: RELOCATION=blue, LOAN=amber, REPAIR=orange, RETURN_FROM_REPAIR=green, AUDIT=slate)
- [ ] T-21 Crear `presentation/components/MovimientoFormDialog.tsx` — form custom con `react-hook-form`: autocomplete activo, auto-fill fromLocation (readonly), autocomplete toLocation, select toBodega filtrado por toLocation, select tipo, textarea razón/notas
- [ ] T-22 Crear `presentation/components/MovimientosTablePage.tsx` — tabs de filtro (Todos + 5 tipos), Kardex banner cuando `currentAssetId` presente, botón "Registrar traslado" (canWrite), acciones inline: eliminar (canDelete)
- [ ] T-23 Crear `movimientos/page.tsx` — Server Component: auth, `hasPermission('movements', 'read')`, parseo de searchParams (page, pageSize, movementType, assetId), `listMovementsAction`, props canWrite + canDelete
- [ ] T-24 Ejecutar `pnpm test:unit` — confirmar 0 fallos (baseline + nuevos tests)

---

## Phase 4: Verificación manual (T-25 → T-27)

- [ ] T-25 Dev server: registrar un traslado de PC Bogotá → Medellín; verificar `Asset.locationId` + `Asset.bodegaId` actualizados en DB
- [ ] T-26 Dev server: abrir `/movimientos?assetId={id}` — verificar Kardex banner visible y lista filtrada
- [ ] T-27 Dev server: login VIEWER → verificar sin botón "Registrar traslado"; login MANAGER → verificar sin botón eliminar
