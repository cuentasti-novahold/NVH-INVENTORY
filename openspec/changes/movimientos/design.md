# Design: Módulo de Traslados de Activos (Kardex)

## Technical Approach

Replicar el stack DDD de `assignments` (DTO → Mapper → Yup → Server Actions → Hook → XxxTablePage → page.tsx) para el modelo `AssetMovement`. Una desviación deliberada: el formulario usa `react-hook-form` directo en lugar de `CrudFormDialog` por necesitar efectos inter-campo reactivos.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Form component | `MovimientoFormDialog` custom | `CrudFormDialog` | `CrudFormDialog` no soporta `onChange` entre campos; necesitamos auto-fill de "Desde" y filtro de bodegas por sede destino |
| Atomic write | `$transaction([create, update, auditLog])` | 3 writes separados | Garantiza consistencia: nunca puede existir un AssetMovement sin el Asset actualizado |
| Kardex UI | Mismo `/movimientos?assetId=X` con banner | Página `/kardex/[id]` separada | Reutiliza toda la infraestructura de lista; menos rutas que mantener |
| Delete semántica | Hard delete | Soft delete / reversal de location | La location actual del activo NO se revierte al borrar; el registro histórico se elimina por error del operador |
| fromLocation | Auto-fill desde el activo (read-only en form) | Campo editable manual | El sistema de verdad es el activo; el operador no puede "inventar" un origen |

## Data Flow

```
Usuario selecciona activo
    │
    ▼
getAssetLocationAction(assetId)
    │  → fromLocationId, fromBodegaId (read-only display)
    ▼
Usuario elige toLocationId (autocomplete)
    │
    ▼
searchBodegasByLocationAction(toLocationId)
    │  → opciones para toBodega select
    ▼
Usuario envía form
    │
    ▼
createMovementAction(dto)
    │
    ├─ tx.assetMovement.create(...)
    ├─ tx.asset.update({ locationId, bodegaId })
    └─ tx.auditLog.create({ action: 'MOVED', before, after })
         │
         └─ revalidatePath('/movimientos') + revalidatePath('/assets')
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Enum `MovementType` + model `AssetMovement` + back-relations en Asset/Location/Bodega/User |
| `src/lib/permissions.ts` | Modify | Resource `'movements'` + entradas por rol |
| `src/components/dashboard/sidebar-nav-config.ts` | Modify | Link "Traslados" con `ArrowRightLeft` en OPERACIONES |
| `src/app/(dashboard)/assets/actions.ts` | Modify | `getAssetLocationAction(assetId)` |
| `src/app/(dashboard)/settings/locations/actions.ts` | Modify | `searchBodegasByLocationAction(locationId)` |
| `src/app/(dashboard)/movimientos/actions.ts` | Create | `list`, `create`, `delete` server actions |
| `src/app/(dashboard)/movimientos/page.tsx` | Create | Server Component — auth + data fetch |
| `src/app/(dashboard)/movimientos/__tests__/actions.test.ts` | Create | ~30 unit tests |
| `src/app/(dashboard)/movimientos/presentation/dto/movement.dto.ts` | Create | `MovementRow`, `CreateMovementDTO` |
| `src/app/(dashboard)/movimientos/presentation/mappers/movement.mapper.ts` | Create | `toMovementRow` + `movementInclude` |
| `src/app/(dashboard)/movimientos/presentation/schemas/movement.schema.ts` | Create | Yup schema |
| `src/app/(dashboard)/movimientos/presentation/hooks/use-movimientos.ts` | Create | `useMovimientos()` |
| `src/app/(dashboard)/movimientos/presentation/components/columns-movimientos.tsx` | Create | TanStack columns + `MovementTypeBadge` |
| `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` | Create | Client principal con tabs + diálogo |
| `src/app/(dashboard)/movimientos/presentation/components/MovimientoFormDialog.tsx` | Create | Form custom con react-hook-form |
| `src/app/(dashboard)/movimientos/presentation/forms/movement-form.config.ts` | Create | Constantes de labels y opciones |

## Interfaces / Contracts

```typescript
// dto/movement.dto.ts
export type MovementType = 'RELOCATION' | 'LOAN' | 'REPAIR' | 'RETURN_FROM_REPAIR' | 'AUDIT';

export interface MovementRow {
  id: string; assetId: string; assetCode: string; assetLabel: string;
  fromLocationId: string | null; fromLocationName: string | null;
  fromBodegaId: string | null;  fromBodegaName: string | null;
  toLocationId: string;         toLocationName: string;
  toBodegaId: string | null;    toBodegaName: string | null;
  movementType: MovementType;   reason: string | null;  notes: string | null;
  movedById: string;            movedByName: string | null;
  movedAt: string;              createdAt: string;
}

export interface CreateMovementDTO {
  assetId: string;
  fromLocationId?: string | null; fromBodegaId?: string | null;
  toLocationId: string;           toBodegaId?: string | null;
  movementType: MovementType;
  reason?: string | null;         notes?: string | null;
}

// assets/actions.ts — new export
export interface AssetLocationInfo {
  locationId: string | null; locationName: string | null;
  bodegaId: string | null;   bodegaName: string | null;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `toMovementRow`, `listMovementsAction`, `createMovementAction`, `deleteMovementAction` | Vitest + prisma mock; $transaction mocked con 3 operaciones |
| Manual | Form auto-fill, filtro bodegas, Kardex banner | Dev server |

## Migration / Rollout

`npx prisma migrate dev --name add_asset_movements` crea la tabla `asset_movements`. No hay datos a migrar — tabla nueva.

## Open Questions

- Ninguna que bloquee la implementación.
