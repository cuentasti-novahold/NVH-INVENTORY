# Exploration: migrate-employees-import

**Project**: nvh-inventory · **Phase**: sdd-explore · **Engram**: `sdd/migrate-employees-import/explore` (#198)

---

## 1. Current importEmployeesAction inventory

**File**: `src/app/(dashboard)/employees/actions.ts` lines 381–521

### Columnas aceptadas hoy (`EmployeeImportRow` DTO)

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `fullName` | `string \| null` | yes | trimmed, min 2 |
| `email` | `string \| null` | yes | yup email validation, lowercased |
| `phone` | `string \| null` | no | trimmed |
| `position` | `string \| null` | no | trimmed |
| `department` | `string \| null` | no | nombre del departamento (no ID) |
| `city` | `string \| null` | no | nombre de ciudad (`contains`) |
| `location` | `string \| null` | no | nombre de sede (`contains`) |
| `isActive` | `string \| boolean \| null` | no | `toBool()` helper |

### FK lookups dentro de `$transaction` (por row)

- **department**: `upsert` por `name` — **CREATE-ON-IMPORT si no existe** (crítico)
- **city**: `findFirst where name contains city.trim()` → throws si no encuentra
- **location**: `findFirst where name contains location.trim()` → throws si no encuentra
- **country**: NO se valida (city es la hoja del FK chain)

### Otros detalles

- ImportLog escrito directamente con `prisma.importLog.create` (no usa `writeImportLog` shared)
- Bug menor: hardcodea `fileName: 'employees-import.xlsx'` (ignora el real)
- Email dedup: scan completo + Set per-batch
- `revalidatePath('/employees')` al final (v2 lo reemplaza con `router.refresh()` en `onSuccess`)

---

## 2. Master validations propuestas para v2

| # | key | tabla | columna | match | error message |
|---|-----|-------|---------|-------|---------------|
| 1 | `departmentName` | `department` | `name` | exact `in` | `'Departamento no existe'` |
| 2 | `cityName` | `city` | `name` | exact `in` | `'Ciudad no existe'` |
| 3 | `locationName` | `location` | `name` | exact `in` | `'Sede no existe'` |

### ⚠️ 2 BREAKING behavior changes vs v1

**A. Department: `upsert` → error-if-not-found**
- v1 crea silenciosamente departamentos al vuelo
- v2: validación falla, usuario debe crear el depto previamente
- Pro: integridad de datos, evita typos creando departamentos fantasma
- Contra: workflow más rígido

**B. City/Location: `contains` → `in` (exact match)**
- v1 hace match parcial (`Bog` matchea "Bogotá")
- v2: exact match (`Bog` no matchea "Bogotá", debe ser exacto)
- Pro: predictibilidad, error explícito
- Contra: usuarios con nombres abreviados deben corregir el archivo

---

## 3. Column shape para v2 `config.client.ts` (8 columnas)

| header | key | type | required | maxLength | width | example |
|--------|-----|------|----------|-----------|-------|---------|
| Nombre completo* | `fullName` | string | true | 120 | 30 | Ana García |
| Correo* | `email` | email | true | 160 | 30 | ana@empresa.com |
| Teléfono | `phone` | string | false | 40 | 18 | +57 300 123 4567 |
| Cargo | `position` | string | false | 120 | 22 | Analista |
| Departamento | `departmentName` | string | false | 120 | 22 | Tecnología |
| Ciudad | `cityName` | string | false | 100 | 20 | Bogotá |
| Sede | `locationName` | string | false | 100 | 20 | Oficina Principal |
| Activo | `isActive` | boolean | false | — | 12 | SI |

**Renames de v1**: `department/city/location` → `departmentName/cityName/locationName` (consistencia con v2). Usuarios necesitan template nuevo.

---

## 4. bulkCreate pattern decision

**Recomendación**: simple loop con FK Maps pre-resueltas (mirror del de categories pero con 3 FKs).

```typescript
const [depts, cities, locs] = await Promise.all([
  prisma.department.findMany({ where: { name: { in: deptNames } }, select: { id: true, name: true } }),
  prisma.city.findMany({ where: { name: { in: cityNames } }, select: { id: true, name: true } }),
  prisma.location.findMany({ where: { name: { in: locNames } }, select: { id: true, name: true } }),
]);
const deptMap = new Map(depts.map(d => [d.name, d.id]));
const cityMap = new Map(cities.map(c => [c.name, c.id]));
const locMap = new Map(locs.map(l => [l.name, l.id]));
```

P2002 (email duplicado) → row error en español. Por qué no `$transaction` batch: rows independientes, no requieren atomicidad cross-row.

---

## 5. EmployeesTablePage migration plan

**Archivo**: `presentation/components/EmployeesTablePage.tsx`

### Cambios

- Quitar import de `@/shared/ui/components/ExcelImportDialog` (v1)
- Agregar import de `@/shared/excel-import/components/ExcelImportDialog` (v2)
- Quitar import de `importEmployeesAction` y `EmployeeImportRow`
- Reemplazar mount del dialog (líneas 224-246):
  - **antes**: props `expectedColumns`, `action`, `parseRow`
  - **después**: props `moduleKey="employees"`, `title`, `onSuccess={() => router.refresh()}`
- `canWrite` ya está como prop, gating del botón ya existe — sin cambios

---

## 6. Cleanup decision

**Recomendación: Opción A — delete v1 en el mismo PR**

- `importEmployeesAction` (lines 381-521): tiene 1 caller (el dialog v1). Tras el swap, 0 callers.
- `toBool` helper (lines 374-379): exclusivo de importEmployeesAction. Borrar con él.
- `EmployeeImportRow` interface (`employee.dto.ts`): solo usada por v1 action + dialog. Borrar.
- `ExcelImportResult`/`ExcelRowError` types: verificar otros consumers durante apply (assets podría todavía usar).

Total deletion: ~155 LOC en actions.ts + ~9 LOC en DTO.

---

## 7. File estimates

| File | Action | LOC |
|------|--------|-----|
| `employees/import/config.client.ts` | NEW | ~45 |
| `employees/import/config.ts` | NEW | ~70 |
| `employees/import/bulk-create.ts` | NEW | ~90 |
| `shared/excel-import/registry.ts` | MODIFY | +3 |
| `employees/presentation/components/EmployeesTablePage.tsx` | MODIFY | net -15 |
| `employees/actions.ts` | DELETE chunk | -155 |
| `employees/presentation/dto/employee.dto.ts` | MODIFY | -9 |
| **Totals** | | ~205 nuevas, ~180 borradas, **net +25** |

---

## 8. Risks

1. **CRITICAL — department auto-create breaking change**: documentar en PR description; usuarios deben crear departamentos manualmente antes del import
2. **city/location exact match breaking change**: error file mostrará nombres exactos faltantes
3. **Within-file email duplicates**: v2 los handle vía P2002 (per-row error), v1 los pre-detectaba con Set scan. Comportamiento ligeramente diferente, aceptable.
4. **`EmployeeImportRow` removal**: verificar no haya otros consumers
5. **`ExcelImportResult`/`ExcelRowError` types**: chequear si assets aún los usa antes de borrarlos
6. **Free fix**: v2 captura el real `fileName` en ImportLog (v1 hardcodeaba)

---

## 9. PR delivery

**Single PR** — net delta ~385 LOC dentro del budget de 400. Cohesión: todo es una feature unificada (add v2 + remove v1 dead code en una sola corrida).

Si reviewer pide split: PR1 = solo adds (config.client + config + bulk-create + registry), PR2 = swap + delete v1. Pero recomendado evitar el split — agrega complejidad sin beneficio.

---

## 10. Next phase

`sdd-propose` con estos inputs:
1. 2 breaking changes confirmados (department error-if-not-found, city/location exact match)
2. `EmployeeImportRow` v2 interface
3. `entity: 'Employee'` en config.ts (required)
4. Single PR strategy
5. Within-file email dup vía P2002 (aceptable)
