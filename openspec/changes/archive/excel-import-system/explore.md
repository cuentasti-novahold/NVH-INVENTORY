# Exploration: excel-import-system

**Project**: nvh-inventory · **Phase**: sdd-explore · **Mode**: interactive (hybrid store)
**Engram**: `sdd/excel-import-system/explore` (#187)

---

## 1. Current state inventory

### v1 dialog & consumers

- `src/shared/ui/components/ExcelImportDialog.tsx` (211 LOC) — generic client dialog. Props: `action: (rows) => Promise<ExcelImportResult>`, `parseRow`, `expectedColumns`. Single-phase (no preview/confirm), client-side xlsx parse, no template download, no error file.
- `src/shared/ui/types/excel-import.types.ts` — defines `ExcelImportResult { inserted, skipped, errors }`.

**Two active consumers** (both **stay on v1** in this change):
- `EmployeesTablePage` → `importEmployeesAction` (employees/actions.ts:381–521): row-by-row, writes ImportLog.
- `AssetsTablePage` → `importAssetsAction` (assets/actions.ts:456–576): same pattern + atomic assetCode generation.

### Infra ya disponible

- `ImportLog` Prisma model: completo, sin migración necesaria (`{ id, userId, entity, fileName, totalRows, successRows, errorRows, errors (Json?), status }`).
- `xlsx@0.18.5` ya instalado. `XLSX.write()` usado en server-side en `assets/actions.ts buildXlsx()` (líneas 635-641) — patrón probado para generar el error file.
- Permisos: `categories:create` ya existe en `lib/permissions.ts` para ADMIN+.

### Greenfield

- `src/shared/excel-import/` no existe. La infra genérica completa es net-new.
- `src/app/(dashboard)/settings/categories/import/` no existe. Es el primer cliente.

---

## 2. Categories module — readiness check

- `CategoriesTablePage.tsx` existe, sin botón ni dialog de import (perfecto para estrenar v2).
- `createCategoryAction` y `CreateCategoryDTO` definen la shape para el bulk-create.
- **FK relevante**: `parentId` (categoría padre) — necesita `masterValidation` resolviendo `parentName` → `parentId`.

### Columnas propuestas para el template

| Header | Key | Type | Required | Notes |
|---|---|---|---|---|
| Nombre* | `name` | string | sí | maxLength 100 |
| Prefijo* | `prefix` | string | sí | maxLength 10 |
| Descripción | `description` | string | no | — |
| Categoría padre | `parentName` | string | no | masterValidation → parentId |
| Vida útil años | `defaultUsefulLife` | number | no | — |

**`fieldConfig` excluido del template** — su edición se hace post-import vía form (es JSON complejo, mal candidato para Excel).

---

## 3. Approach decisions (las 6 resueltas)

| Decisión | Elegido | Rationale |
|---|---|---|
| Registry registration | **Imports explícitos en `registry.ts`** | Predecible para el bundler de Next, sin side-effects mágicos |
| Excel parser | **`xlsx` sync (ya en proyecto)** | Cero deps nuevas, probado, archivos chicos en este caso de uso |
| Error file | **Server-side base64 vía `XLSX.write`** | Patrón ya probado en assets/actions.ts; mejor UX que devolver lista de errores plana |
| `handler` location | **`bulk-create.ts` separado, referenciado en `config.ts`** | Testeable aislado, alineado a skill v2 |
| ImportLog write | **Dentro del handler vía helper `writeImportLog`** | Handler conoce el `entity`; mantiene el action genérico limpio |
| Timeout risk | **`maxRows: 5000` para categories (~2s)** | Single-table, sin generación de assetCode. Asset será un riesgo en futura migración |

---

## 4. Open question para el propose

**Cuando `parentName` se especifica pero no se encuentra en la DB**: ¿silenciosamente `parentId: null` (root category) o error de fila?

- **Recomendación del explorer**: error de fila — explicit fail es más seguro para integridad. El usuario verá la fila inválida en el error file y la corrige.

---

## 5. File estimates

### `src/shared/excel-import/` (genérico, write-once)

| Archivo | LOC est. |
|---|---|
| `types.ts` | ~60 |
| `registry.ts` | ~20 |
| `parser.ts` | ~40 |
| `validator.ts` | ~80 |
| `master-validator.ts` | ~40 |
| `error-excel-builder.ts` | ~35 |
| `log.ts` | ~20 |
| `actions.ts` | ~70 |
| `components/ExcelImportDialog.tsx` | ~180 |
| **Subtotal** | **~545** |

### `src/app/(dashboard)/settings/categories/import/`

| Archivo | LOC est. |
|---|---|
| `config.ts` | ~45 |
| `bulk-create.ts` | ~45 |
| **Subtotal** | **~90** |

### Modified

| Archivo | Delta |
|---|---|
| `CategoriesTablePage.tsx` | +25 |

**Total: ~660 LOC nuevas + ~25 modificadas.**

⚠️ **PR1 (infra ~545) excede el budget de 400 líneas/PR.** En `tasks` vamos a tener que decidir entre:
- Splitear PR1 en dos (foundation + actions/dialog), o
- Aceptar `size:exception` para PR1 con justificación (foundation cohesiva, sin lógica pesada)

PR2 (categories ~115) está cómodo bajo el budget.

---

## 6. Coexistence strategy

**Path A — recomendado**: v1 dialog vive intacto en `@/shared/ui/components/ExcelImportDialog`. v2 se construye nuevo en `@/shared/excel-import/components/ExcelImportDialog.tsx`. `CategoriesTablePage` importa del path nuevo. Migración futura de assets/employees → cambio aparte.

**Por qué Path A**: cero riesgo de regresión en módulos productivos, los dos sistemas no se pisan, la migración futura es lift-and-shift por módulo.

---

## 7. Next phase

`sdd-propose` con estos inputs:
1. Path A coexistence confirmada
2. Pregunta abierta: parentName-not-found → null o row error
3. fieldConfig excluido del template
4. Plan PR split: PR1 (~545 infra) + PR2 (~115 categories), con flag de size:exception para PR1
5. Las 6 decisiones de approach ya tomadas

## Risks for the proposal stage

- v1 consumers (assets, employees) NO migrados — explicit out-of-scope
- parentName-not-found semantics (a decidir)
- `fieldConfig` excluido del import (limitación documentada)
- Timeout risk para futura migración de assets (no aplica a categories)
