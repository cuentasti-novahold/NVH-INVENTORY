# Proposal: migrate-employees-import

**Project**: nvh-inventory · **Phase**: sdd-propose · **Engram**: `sdd/migrate-employees-import/proposal`

---

## 1. Intent

Migrar el módulo de empleados del sistema de importación Excel v1 (acción ad-hoc `importEmployeesAction` + `ExcelImportDialog` legacy con `parseRow`) al sistema v2 generic introducido en el change `excel-import-system` y validado por el módulo de categorías.

El problema concreto: hoy `EmployeesTablePage` consume un dialog v1 que parsea filas en cliente y las envía al servidor (anti-patrón), con su propia variante de logueo de `ImportLog` (saltea `writeImportLog` shared, hardcodea `fileName`), validaciones inline y semánticas de FK inconsistentes con el resto del sistema. La migración alinea empleados con la pieza ya probada (`categories/import/`) y deja al módulo listo para evolucionar bajo el contrato v2 (masterValidations, server-side parsing, error file download).

Éxito = el flujo de "Importar Excel" en `/employees` se ve y comporta exactamente igual que el de categorías (template descargable, preview con errores agregados, confirm con `ImportLog` correcto, error file en fallos parciales) y no queda código v1 vivo en empleados.

---

## 2. Why now

- El sistema v2 ya está archivado y probado en producción con categorías (ver `sdd/excel-import-system/archive-report` #196).
- Empleados es el siguiente módulo natural: tabla simple, FKs documentadas, sin schema migrations.
- Sin esta migración tenemos dos rutas de import coexistiendo (v1 dialog en empleados + assets, v2 dialog en categorías). La deuda crece con cada módulo nuevo.
- Cero blockers — se puede ejecutar autónomamente.

---

## 3. Scope

### In scope (single PR)

- **ADD** `src/app/(dashboard)/employees/import/config.client.ts` (~45 LOC) — 8 columnas, template metadata
- **ADD** `src/app/(dashboard)/employees/import/config.ts` (~70 LOC) — `entity: 'Employee'`, 3 masterValidations, `rowTransformer`
- **ADD** `src/app/(dashboard)/employees/import/bulk-create.ts` (~90 LOC) — pre-resolve de 3 FK Maps en paralelo + loop con P2002 handling
- **MODIFY** `src/shared/excel-import/registry.ts` (+3) — registrar `employeesImportConfig`
- **MODIFY** `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` (~-15 net) — swap del dialog v1 → v2 (`moduleKey="employees"`, `onSuccess={() => router.refresh()}`)
- **MODIFY** `src/app/(dashboard)/employees/presentation/dto/employee.dto.ts` (-9) — borrar interface `EmployeeImportRow`
- **DELETE** chunk en `src/app/(dashboard)/employees/actions.ts` (-155) — `importEmployeesAction` + helper `toBool`

Net delta ≈ **+205 / -180 = ~385 líneas cambiadas**, dentro del budget de 400.

### Out of scope (changes posteriores explícitos)

- Migración de `AssetsTablePage` al sistema v2 → change separado `migrate-assets-import`
- Eliminación de `src/shared/ui/components/ExcelImportDialog.tsx` (v1) → change separado `cleanup-v1-dialog` (assets aún lo usa)
- Schema migrations de Prisma (no se requieren)
- Tests automatizados (`strict_tdd: disabled` en este proyecto)
- Pre-flight de emails duplicados dentro del mismo archivo (v2 cubre vía P2002 per-row, aceptable per explore §8)
- UI nueva para crear departamentos previo al import (los usuarios ya tienen `/settings/departments`)

---

## 4. Approach summary

Espejar exactamente el patrón de categorías. Tres archivos en `employees/import/`:

1. **`config.client.ts`** — exporta `columns: ExcelImportColumn<EmployeeImportRow>[]` y `template: ExcelImportTemplate`. 8 columnas: `fullName*`, `email*`, `phone`, `position`, `departmentName`, `cityName`, `locationName`, `isActive`. Importable desde browser (sin `'use server'`).
2. **`config.ts`** — exporta `employeesImportConfig: ExcelImportConfig<EmployeeImportRow>` con `entity: 'Employee'`, `moduleKey: 'employees'`, las 3 `masterValidations` (department/city/location, todas `match: 'in'`), `rowTransformer` que hace lowercase + trim, y referencia al `bulkCreate`.
3. **`bulk-create.ts`** — pre-resuelve 3 FK Maps en paralelo (`Promise.all` de 3 `findMany` con `where: { name: { in: [...] } }`), loop sobre rows resolviendo `departmentId/cityId/locationId` desde los Maps, `prisma.employee.create` con try/catch P2002 para email duplicado.

Después: registrar el config en `registry.ts`, swap del mount del dialog en `EmployeesTablePage`, y borrar el código v1 muerto (action + DTO + helper).

No hay arquitectura nueva — esto es estrictamente un consumer del sistema v2.

---

## 5. Architecture sketch

Sin diagrama nuevo. Ver `skills/nextjs-16/excel-import/SKILL.md` para el contrato v2 y `src/app/(dashboard)/settings/categories/import/` como referencia working. Empleados es estructuralmente idéntico a categorías excepto:

- 8 columnas en lugar de 5
- 3 FK lookups en lugar de 0
- P2002 handling para `email` único (categorías no tiene unique además del PK)

---

## 6. Key decisions

| # | Decisión | Elección | Justificación |
|---|----------|----------|---------------|
| 1 | Department: `upsert` vs error-if-not-found | **error-if-not-found** | v1 creaba departamentos al vuelo silenciosamente — riesgo de typos generando registros fantasma. v2 fuerza calidad de datos. **Breaking change** documentado en PR. |
| 2 | City/Location: `contains` vs `in` | **`in` exacto** | v1 hacía match parcial (`Bog` → "Bogotá"). Predictibilidad y consistencia con masterValidations stock. **Breaking change** documentado. |
| 3 | Cleanup de v1 | **Mismo PR** (Opción A) | `importEmployeesAction` tiene 1 caller único; tras el swap quedan 0. Mantener código muerto crea ambigüedad sobre qué ruta está activa. |
| 4 | Renombrado de columnas | `department`/`city`/`location` → `departmentName`/`cityName`/`locationName` | Consistencia con convención v2 (la key indica el tipo de dato, no el ID). Usuarios necesitarán template nuevo, descargable desde el dialog. |
| 5 | Estrategia de delivery | **Single PR** | Cohesión funcional + budget cumple (385 < 400). Splitear agregaría complejidad sin beneficio. Fallback documentado en §8. |
| 6 | bulkCreate pattern | **Loop simple con FK Maps pre-resueltas** | Rows independientes, sin atomicidad cross-row. Mismo patrón que categorías. `$transaction` batch sería overkill. |

---

## 7. Risks & mitigations

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Departamento desconocido bloquea filas (vs v1 que las creaba) | Media — breaking change | El error file descargable lista exactamente qué `departmentName` faltan. PR description incluye nota: "Crear departamentos en `/settings/departments` antes de importar". Comunicar al equipo de operaciones. |
| Nombres de ciudad/sede abreviados dejan de matchear | Media — breaking change | Misma mitigación: error file muestra valores exactos esperables. Workflow: usuario corrige el archivo, vuelve a subir. |
| Emails duplicados dentro del mismo archivo no detectados en pre-flight | Baja | v2 los captura vía P2002 en bulkCreate; row-level error en español ("Correo duplicado"). Aceptado per explore §8. Si se vuelve fricción, futura mejora: agregar masterValidation custom de duplicados intra-batch. |
| `EmployeeImportRow`/`ExcelImportResult`/`ExcelRowError` aún consumidos por otros archivos | Baja | El TablePage de assets sigue usando v1 con sus tipos legacy. **NO** se borra `excel-import.types.ts` en este PR; solo el `EmployeeImportRow` propio del módulo (verified single-module usage en explore §6). |
| `revalidatePath('/employees')` reemplazado por `router.refresh()` | Baja | Comportamiento equivalente UX-wise; v2 ya lo prueba en categorías. |

---

## 8. PR delivery plan

**Estrategia primaria**: Single PR (~385 LOC delta).

**Fallback** (si el reviewer pide split):
- **PR 1** (~205 LOC, pure additions): los 3 archivos en `employees/import/` + registry update. Sin efectos en runtime hasta que se monte.
- **PR 2** (~180 LOC, swap + delete): cambio en `EmployeesTablePage` + borrado de `importEmployeesAction` + `toBool` + `EmployeeImportRow`.

Esta partición es limpia (PR 1 solo agrega; PR 2 solo intercambia/borra). Decisión final del split queda al reviewer.

Commit conventions: conventional commits, sin `Co-Authored-By` (per CLAUDE.md global rules).

---

## 9. Acceptance criteria

- [ ] En `/employees`, botón "Importar Excel" sigue visible y gateado por `canWrite`
- [ ] Al hacer click se abre el dialog v2 (mismo look & feel que categorías)
- [ ] "Descargar plantilla" entrega un `.xlsx` con las 8 columnas y ejemplos en español
- [ ] Subir un archivo válido muestra preview con conteo "X filas válidas, Y con errores"
- [ ] Subir archivo con `departmentName` inexistente → error visible "Departamento no existe" con número de fila
- [ ] Subir archivo con `cityName` o `locationName` inexistente → error análogo
- [ ] Confirm exitoso → filas insertadas en `Employee`, `ImportLog` escrito con `entity: 'Employee'` y `fileName` real (no hardcoded)
- [ ] Confirm con fallos parciales → archivo de errores descargable
- [ ] Email duplicado (vs DB existente o intra-batch) → row error "Correo duplicado", el resto se inserta
- [ ] `importEmployeesAction`, `toBool`, `EmployeeImportRow` ya no existen en el repo (verificable por `rg`)
- [ ] `pnpm lint` pasa sin warnings nuevos

---

## 10. Open questions

Ninguna. Las 3 decisiones críticas (department, city/location, cleanup) quedaron lockeadas en review interactivo previo a este propose. Listo para `sdd-spec` + `sdd-design` en paralelo.
