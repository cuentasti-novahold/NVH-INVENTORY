# ¿Puede este sistema manejar activos más allá de tecnología?

## Veredicto directo

**Sí — y la base ya está ahí.** El modelo Asset tiene 30 columnas: 22 completamente genéricas, 8 IT-específicas que pueden ocultarse con fieldConfig. Con 1–2 horas de trabajo, el sistema gestiona muebles, vehículos, maquinaria, herramientas o inmuebles sin tocar el schema de Prisma.

---

## Lo que ya es genérico HOY

| Campo | ¿Sirve para activos no-IT? |
|-------|--------------------------|
| `brand`, `model`, `serialNumber`, `assetTag` | ✅ Cualquier activo físico |
| `purchasePrice`, `currencyCode`, `purchasePriceBase` | ✅ Financiero universal |
| `salvageValue`, `usefulLifeYears`, `purchaseDate` | ✅ Depreciación NIIF para cualquier activo |
| `generalStatus`, `functionalStatus` | ✅ GOOD/REGULAR/BAD/DAMAGED/RETIRED aplica a todo |
| `locationId`, `bodegaId` | ✅ Ubicación física universal |
| `parentAssetId` → componentes hijo | ✅ Vehículo → neumáticos, oficina → escritorios |
| `notes` | ✅ Observaciones libres |
| `metadata Json?` | ✅ Campos extra por categoría (ver abajo) |
| `assetCode` (NVH-{prefix}-XXXXX) | ✅ Código único por tipo de activo |
| `isActive`, `lastRevision`, `createdAt` | ✅ Ciclo de vida universal |

**Estos 22 campos funcionan para CUALQUIER bien físico inventariable.**

---

## Los 8 campos IT-específicos — y cómo ocultarlos

```
processor, ram, storageCapacity, storageType, operatingSystem
hostname, phoneNumber, imei
```

Todos están controlados por `Category.fieldConfig`. Con el preset `'peripheral'` todos quedan `hidden`. El formulario de activos los oculta completamente usando `visibilityDependsOn: SPEC_VISIBILITY` — no aparecen ni en el form ni en la vista de detalle.

**Prueba**: crear la categoría "Silla Ergonómica" con preset `peripheral` → el form muestra solo: marca, modelo, serial, financiero, ubicación, estado, notas. Cero campos de PC.

---

## El único problema real: el preset no termina de conectarse

### Qué está hecho

- `FIELD_CONFIG_PRESETS` definido en `field-config-presets.ts` (computer, phone, storage, **peripheral**)
- UI del category form tiene selector visual de presets (4 botones con íconos)
- `category.schema.ts` acepta `fieldConfigTemplate`
- Form de activos lee `fieldConfig` desde `getCategoryFieldConfigAction` y aplica visibilidad

### Qué falta (el glue code)

En `createCategoryAction` / `updateCategoryAction`: cuando llega `fieldConfigTemplate: 'peripheral'`, no se mapea a `fieldConfig: { processor: 'hidden', ... }`. La acción guarda el preset como string pero NO genera el JSON de fieldConfig automáticamente.

### Fix estimado: 1–2 horas

```typescript
// En actions.ts de categories, antes de crear/actualizar:
import { FIELD_CONFIG_PRESETS } from './presentation/forms/field-config-presets'

if (dto.fieldConfigTemplate && FIELD_CONFIG_PRESETS[dto.fieldConfigTemplate]) {
  dto.fieldConfig = FIELD_CONFIG_PRESETS[dto.fieldConfigTemplate]
}
```

---

## ¿Qué tipos de activos pueden gestionarse?

| Tipo de activo | ¿Funciona? | Campos utilizables |
|----------------|-----------|-------------------|
| Muebles y oficina | ✅ Con el fix | brand=marca, model=modelo, serial=código interno, notas |
| Vehículos empresa | ✅ Con el fix | brand=marca, model=modelo, serial=placa/VIN, notes=observaciones |
| Maquinaria industrial | ✅ Con el fix | Igual que vehículos |
| Herramientas | ✅ Con el fix | Mismo patrón, jerarquía padre-hijo para kits |
| Inmuebles / sedes | ⚠️ Parcial | Sin m², sin dirección como campo propio |
| Licencias de software | ⚠️ Parcial | Sin campo de fecha de vencimiento específico |
| Equipos con specs únicas | ❌ Sin custom fields | Sin VIN, HP, capacidad de carga en campos dedicados |

---

## El campo `metadata Json?` — el comodín

El campo existe en la tabla `assets` pero **no está conectado a la UI**. Es el hueco exacto para campos específicos por categoría: VIN para vehículos, m² para inmuebles, HP para maquinaria.

### Opciones para activarlo

| Opción | Esfuerzo | Resultado |
|--------|----------|-----------|
| **A — JSON libre**: agregar `textarea` de metadata como JSON editable | 2–3 días | Funcional, poco elegante |
| **B — Custom fields en fieldConfig**: extender el JSON con `customFields[]` | 1–2 semanas | Campos con label, tipo y validación por categoría |
| **C — FieldDefinition model en Prisma**: modelo dedicado con renderer | 3–4 semanas | Solución enterprise-grade |

**Opción B recomendada** — el `CrudFormDialog` ya soporta campos dinámicos; renderizar `customFields` es trabajo directo.

```json
{
  "processor": "hidden",
  "customFields": [
    { "key": "vin", "label": "VIN / Placa", "type": "text", "required": true },
    { "key": "year", "label": "Año modelo", "type": "number" },
    { "key": "mileage", "label": "Kilometraje", "type": "number" }
  ]
}
```

---

## Categorías nuevas que se pueden agregar ya

| Categoría | Prefix | Preset | Código generado |
|-----------|--------|--------|----------------|
| Mobiliario | `MOB` | peripheral | `NVH-MOB-00001` |
| Vehículos | `VEH` | peripheral | `NVH-VEH-00001` |
| Maquinaria | `MAQ` | peripheral | `NVH-MAQ-00001` |
| Herramientas | `HER` | peripheral | `NVH-HER-00001` |
| Infraestructura | `INF` | peripheral | `NVH-INF-00001` |

Ciclo de vida, depreciación NIIF, asignación a empleados, mantenimiento, movimientos entre sedes — **todo funciona de inmediato** para estas categorías.

---

## Plan de acción (priorizado)

| Prioridad | Qué hacer | Archivo afectado | Esfuerzo |
|-----------|-----------|-----------------|----------|
| 🔴 Crítico | Conectar preset → fieldConfig en `createCategoryAction` | `src/app/(dashboard)/settings/categories/actions.ts` | 1–2 horas |
| 🟡 Recomendado | Activar `metadata` con custom fields en fieldConfig | `fieldConfig` + `CrudFormDialog` | 1–2 semanas |
| 🟢 Opcional | Renderer específico por tipo de activo en detalle | `AssetDetailView.tsx` | 3–5 días |
| ⚪ Futuro | `FieldDefinition` model en Prisma | Schema + migración | 3–4 semanas |

---

## Conclusión

La arquitectura fue diseñada con visión correcta: el modelo `Asset` es genérico, el sistema de categorías es extensible, y el `fieldConfig` puede ocultar todo lo IT-específico. El problema es que el último metro del cable no está conectado — el preset `peripheral` existe pero no genera el `fieldConfig` automáticamente.

**Con 1–2 horas de código**, este sistema gestiona CUALQUIER bien físico de una empresa. No hace falta tocar el schema de Prisma, no hace falta migración, no hace falta rediseñar nada.
