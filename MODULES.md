# Módulos del sistema — Novahold Inventory ERP

Descripción funcional de cada módulo, sus responsabilidades y el flujo completo de operación.

---

## Índice

1. [Autenticación](#1-autenticación)
2. [Dashboard / KPIs](#2-dashboard--kpis)
3. [Activos](#3-activos)
4. [Empleados](#4-empleados)
5. [Asignaciones](#5-asignaciones)
6. [Traslados (Kardex)](#6-traslados-kardex)
7. [Analytics](#7-analytics)
8. [Configuración — Categorías](#8-configuración--categorías)
9. [Configuración — Sedes y Bodegas](#9-configuración--sedes-y-bodegas)
10. [Configuración — Usuarios](#10-configuración--usuarios)
11. [Importación masiva Excel](#11-importación-masiva-excel)

---

## 1. Autenticación

### Qué hace

Controla el acceso al sistema mediante OAuth2 con Azure AD. Solo usuarios con email `@novahold.com` pueden ingresar.

### Flujo

```
Usuario abre la app
        │
        ▼
Middleware verifica sesión JWT
        │
   ¿Tiene sesión?
   ┌────┴────┐
  NO        SÍ
   │         │
   ▼         ▼
/login   Dashboard (/(dashboard)/*)
   │
   ▼
Clic en "Iniciar sesión con Microsoft"
   │
   ▼
Redirige a Microsoft OAuth2 (Azure AD)
   │
   ▼
Microsoft verifica email @novahold.com
   │
   ¿Email válido?
   ┌────┴────┐
  NO        SÍ
   │         │
   ▼         ▼
Error    Callback a /api/auth/callback
         │
         ▼
    ¿Usuario existe en DB?
    ┌────┴────────────┐
   NO                SÍ
    │                 │
    ▼                 ▼
Crea User con      Actualiza sesión
rol VIEWER
    │
    └────────┬────────┘
             ▼
         Dashboard
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/auth.ts` | Configuración NextAuth, adapter Prisma, callbacks de sesión |
| `src/auth.config.ts` | Restricción de dominio `@novahold.com` |
| `src/middleware.ts` | Protección de rutas — redirige a /login si no hay sesión |
| `src/app/login/page.tsx` | Pantalla de login |

---

## 2. Dashboard / KPIs

### Qué hace

Pantalla de inicio del ERP. Muestra tarjetas de resumen con los indicadores clave del inventario en tiempo real.

### Indicadores mostrados

- Total de activos activos en el sistema
- Activos asignados vs sin asignar
- Asignaciones activas del mes
- Traslados recientes

### Flujo

```
Usuario ingresa al dashboard
        │
        ▼
page.tsx (Server Component)
        │
        ▼
Consultas paralelas a la DB (Promise.all)
  - COUNT de activos activos
  - COUNT de asignaciones activas
  - COUNT de movimientos del mes
        │
        ▼
Renderiza KpiCard × N con los valores
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/page.tsx` | Server Component — fetch + render |
| `src/components/dashboard/` | KpiCard, PageHeader, sidebar |

---

## 3. Activos

### Qué hace

Módulo central del sistema. Gestiona el ciclo de vida completo de cada activo tecnológico: creación, edición, desactivación, eliminación e importación masiva.

### Conceptos clave

- **Tabla única**: un solo modelo `Asset` cubre todos los tipos (laptop, monitor, mouse, celular, etc.)
- **fieldConfig**: cada categoría define qué campos son `required`, `optional` o `hidden` para su tipo de activo
- **assetCode**: código único generado automáticamente con formato `NVH-{PREFIX}-{NNNNN}`
- **Jerarquía**: un activo puede ser componente de otro (ej: un cargador vinculado a una laptop)
- **Estado doble**: `generalStatus` (estado físico) y `functionalStatus` (si opera correctamente)

### Flujo — Crear activo

```
Usuario clic en "Nuevo activo"
        │
        ▼
AssetFormDialog se abre
        │
        ▼
Usuario escribe en "Categoría" (autocomplete)
        │
        ▼
Server Action: searchCategoriesAction(query)
        │
        ▼
Usuario selecciona una categoría
        │
        ▼
Server Action: getCategoryFieldConfigAction(categoryId)
  → Retorna fieldConfig (qué campos mostrar/requerir)
        │
        ▼
Formulario se adapta dinámicamente:
  - Procesador/RAM/SO: visible solo si categoría = laptop/desktop
  - Teléfono/IMEI: visible solo si categoría = celular
  - etc.
        │
        ▼
Usuario completa el formulario y clic en "Guardar"
        │
        ▼
Server Action: createAssetAction(dto)
  1. Validación Yup según fieldConfig
  2. $transaction:
     a. category.update({ sequence: { increment: 1 } })
     b. Genera assetCode = "NVH-{prefix}-{sequence}"
     c. Si assetCode ya existe → reintentar (hasta 20x)
     d. Convierte precio a COP (si moneda ≠ COP, busca TRM)
     e. asset.create(data)
  3. revalidatePath('/assets')
        │
        ▼
Toast "Activo creado" + dialog se cierra
        │
        ▼
Tabla se recarga con el nuevo activo
```

### Flujo — Editar activo

```
Usuario clic en ✏️ (ícono editar en la fila)
        │
        ▼
AssetFormDialog se abre con valores pre-cargados
  (categoryLabel, locationLabel, etc. para los autocompletes)
        │
        ▼
Usuario modifica campos
        │
        ▼
Server Action: updateAssetAction(id, dto)
  1. Validación Yup
  2. prisma.asset.update(...)
  3. revalidatePath('/assets')
```

### Flujo — Desactivar activo

```
Usuario clic en ⏻ (PowerOff)
        │
        ▼
Server Action: deactivateAssetAction(id)
  → asset.update({ isActive: false })
```

### Flujo — Eliminar activo

```
Usuario clic en 🗑️ (Trash)
        │
        ▼
¿Tiene asignaciones o componentes?
   ┌────┴────┐
  SÍ        NO
   │         │
   ▼         ▼
Toast de  confirm("¿Eliminar...?")
 error         │
               ▼
       deleteAssetAction(id)
       → asset.delete(...)
```

### Filtros y paginación

- **Estado**: Activos / Inactivos / Todos
- **Búsqueda**: por `assetCode`, `brand`, `model`, `serialNumber`
- **Paginación**: server-side, parámetros en URL (`?page=1&pageSize=20`)

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/assets/page.tsx` | Server Component — fetch paginado |
| `src/app/(dashboard)/assets/actions.ts` | Server Actions: create, update, deactivate, delete, import |
| `src/app/(dashboard)/assets/presentation/components/AssetsTablePage.tsx` | Client — tabla + dialogs |
| `src/app/(dashboard)/assets/presentation/components/AssetFormDialog.tsx` | Formulario con fieldConfig dinámico |
| `src/app/(dashboard)/assets/presentation/components/columns-assets.tsx` | Definición de columnas TanStack |

---

## 4. Empleados

### Qué hace

Gestiona el directorio de empleados de la empresa. Cada empleado puede tener activos asignados y estar vinculado a una cuenta de usuario del sistema.

### Campos

- Nombre, email, teléfono, cargo
- Departamento (autocompletado)
- Ciudad y Sede (autocompletados en cascada)
- Estado activo/inactivo

### Flujo — Crear empleado

```
Usuario clic en "Nuevo empleado"
        │
        ▼
CrudFormDialog se abre (usando FormConfig genérico)
        │
        ▼
Usuario llena: nombre, email, departamento, ciudad, sede
  (departamento, ciudad, sede = campos autocomplete
   con Server Actions de búsqueda)
        │
        ▼
Server Action: createEmployeeAction(dto)
  → employee.create(data)
  → revalidatePath('/employees')
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/employees/page.tsx` | Server Component — fetch con paginación |
| `src/app/(dashboard)/employees/actions.ts` | Server Actions CRUD |
| `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` | Client — tabla + dialogs |
| `src/app/(dashboard)/employees/presentation/forms/employee-form.config.ts` | FormConfig con autocompletes |

---

## 5. Asignaciones

### Qué hace

Controla qué activos están asignados a qué empleados. Vista centrada en el empleado: una fila por persona, con modal de detalle que muestra todos sus activos y permite gestionar el ciclo completo.

### Estados de asignación

| Estado | Significa |
|--------|-----------|
| `ACTIVE` | El empleado tiene el activo actualmente |
| `RETURNED` | El activo fue devuelto |
| `TRANSFERRED` | El activo se transfirió a otro empleado |

### Flujo — Asignar activo a empleado

```
Usuario abre modal de empleado (clic en fila)
        │
        ▼
Modal muestra lista de activos asignados actualmente
        │
        ▼
Clic en "Asignar activo"
        │
        ▼
Mini-form: buscar activo (autocomplete)
        │
        ▼
Server Action: createAssignmentAction({ assetId, employeeId })
  1. Verifica que el activo no tenga asignación ACTIVE
  2. assignment.create({ status: 'ACTIVE', assignedAt: now() })
  3. auditLog.create(...)
  4. revalidatePath('/assignments')
```

### Flujo — Devolver activo

```
Usuario clic en "Devolver" en el modal
        │
        ▼
Formulario: notas de devolución (campo de texto)
        │
        ▼
Server Action: returnAssetAction(assignmentId, notes)
  → assignment.update({ status: 'RETURNED', returnedAt: now(), notes })
  → auditLog.create(...)
```

### Flujo — Transferir activo entre empleados

```
Usuario clic en "Transferir"
        │
        ▼
Buscar empleado destino (autocomplete)
        │
        ▼
Server Action: transferAssetAction(assignmentId, newEmployeeId)
  $transaction:
    1. assignment.update({ status: 'TRANSFERRED', returnedAt: now() })
    2. assignment.create({ employeeId: newEmployeeId, status: 'ACTIVE' })
    3. auditLog.create(...)
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/assignments/page.tsx` | Server Component — lista de empleados con activos |
| `src/app/(dashboard)/assignments/actions.ts` | Server Actions: assign, return, transfer |
| `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` | Vista employee-centric |

---

## 6. Traslados (Kardex)

### Qué hace

Registra y consulta el historial completo de movimientos físicos de activos entre sedes y bodegas. Responde la pregunta: **¿dónde ha estado este activo?**

### Tipos de movimiento

| Tipo | Descripción |
|------|-------------|
| `RELOCATION` | Traslado permanente entre sedes |
| `LOAN` | Préstamo temporal |
| `REPAIR` | Enviado a reparación |
| `RETURN_FROM_REPAIR` | Regresó de reparación |
| `AUDIT` | Movimiento para auditoría |

### Flujo — Registrar traslado

```
Usuario clic en "Nuevo traslado"
        │
        ▼
MovimientoFormDialog se abre
        │
        ▼
Usuario busca activo (autocomplete assetCode)
        │
        ▼
Sistema auto-completa "Sede origen" con la ubicación actual del activo
        │
        ▼
Usuario selecciona "Sede destino" y "Bodega destino"
        │
        ▼
Selecciona tipo de movimiento + escribe razón
        │
        ▼
Server Action: createMovementAction(dto)
  $transaction:
    1. assetMovement.create({ fromLocation, toLocation, movementType, ... })
    2. asset.update({ locationId: toLocationId, bodegaId: toBodegaId })
    3. auditLog.create(...)
  revalidatePath('/movimientos')
```

### Flujo — Consultar Kardex de un activo

```
Tabla principal muestra todos los traslados (paginados)
        │
Filtros disponibles:
  - Por activo (assetCode)
  - Por sede
  - Por tipo de movimiento
  - Por rango de fechas
        │
        ▼
Cada fila muestra:
  Activo | Origen → Destino | Tipo | Responsable | Fecha
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/movimientos/page.tsx` | Server Component — fetch con filtros |
| `src/app/(dashboard)/movimientos/actions.ts` | Server Actions: create movement |
| `src/app/(dashboard)/movimientos/presentation/components/MovimientosTablePage.tsx` | Client — tabla + dialog |
| `src/app/(dashboard)/movimientos/presentation/components/MovimientoFormDialog.tsx` | Form custom con auto-fill de sede origen |

---

## 7. Analytics

### Qué hace

Dashboard ejecutivo con 4 pestañas y 9 gráficos. Datos calculados server-side al cargar la página — sin polling, sin client-side fetching.

### Pestañas y contenido

#### Inventario
- Distribución de activos por categoría (gráfico de barras)
- Estado general del inventario — GOOD / REGULAR / BAD / DAMAGED (gráfico de torta)
- Activos activos vs inactivos
- Top 5 marcas con más activos

#### Financiero
- Valor total del inventario en libros (COP)
- Depreciación acumulada total
- Evolución del valor de activos por año de compra (línea de tiempo)
- Distribución por moneda de compra

#### Asignaciones
- Tasa de asignación: activos asignados vs sin asignar
- Top 10 empleados con más activos
- Asignaciones por departamento

#### Movimientos
- Traslados por mes (últimos 12 meses)
- Distribución por tipo de movimiento
- Sedes con más actividad

### Flujo

```
Usuario navega a /analytics
        │
        ▼
page.tsx (Server Component)
        │
        ▼
Promise.all([
  getInventarioData(),
  getFinancieroData(),
  getAsignacionesData(),
  getMovimientosData(),
])
        │
        ▼
AnalyticsDashboard (Client Component)
  recibe todos los datos como props
        │
        ▼
Tabs shadcn/ui → cada tab renderiza sus gráficos
  KpiCard × N + Chart × N
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/analytics/page.tsx` | Server Component — 4 fetches paralelos |
| `src/app/(dashboard)/analytics/actions.ts` | Server Actions de cómputo analítico |
| `src/app/(dashboard)/analytics/presentation/` | Componentes de dashboard y gráficos |

---

## 8. Configuración — Categorías

### Qué hace

Gestiona las categorías de activos (Laptop, Monitor, Celular, etc.) y el `fieldConfig` que controla qué campos son visibles en el formulario de cada tipo.

### fieldConfig

Es un JSON almacenado por categoría que define la visibilidad de cada campo:

```json
{
  "processor": "required",
  "ram": "required",
  "storageCapacity": "optional",
  "operatingSystem": "optional",
  "phoneNumber": "hidden",
  "imei": "hidden"
}
```

Valores posibles: `"required"` · `"optional"` · `"hidden"`

### Categorías predefinidas

| Categoría | Prefix | Campos visibles clave |
|-----------|--------|----------------------|
| Computador Portátil | PC | processor, ram, storage, OS |
| Computador Escritorio | DSK | processor, ram, storage, OS |
| Monitor | MON | solo identificación |
| Celular Empresa | PHN | phoneNumber, IMEI |
| Disco Externo | EXT | storageCapacity, storageType |
| Teclado | KB | solo identificación |
| Mouse | MSE | solo identificación |
| Cargador | CHG | solo identificación |
| Diadema | HDST | solo identificación |

### Flujo — Crear categoría

```
SUPER_ADMIN / ADMIN navega a /settings/categories
        │
        ▼
Clic en "Nueva categoría"
        │
        ▼
CrudFormDialog: nombre, prefix, vida útil por defecto, fieldConfig
        │
        ▼
Server Action: createCategoryAction(dto)
  → category.create(...)
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/settings/categories/page.tsx` | Server Component |
| `src/app/(dashboard)/settings/categories/actions.ts` | Server Actions CRUD |

---

## 9. Configuración — Sedes y Bodegas

### Qué hace

Gestiona la jerarquía geográfica: **País → Ciudad → Sede (Location) → Bodega**.

Cada activo y empleado puede estar vinculado a una sede específica, y cada activo puede estar en una bodega dentro de esa sede.

### Jerarquía

```
Colombia (Country)
  └─ Bogotá (City)
       └─ Sede Principal (Location)
            ├─ Bodega Norte (Bodega)
            └─ Bodega Sur (Bodega)
  └─ Medellín (City)
       └─ Sede Medellín (Location)
            └─ Almacén (Bodega)
```

### Flujo — Crear sede

```
ADMIN navega a /settings/locations
        │
        ▼
Pestaña "Sedes" → clic en "Nueva sede"
        │
        ▼
CrudFormDialog: nombre, dirección, ciudad (autocomplete)
        │
        ▼
Server Action: createLocationAction(dto)
  → location.create({ name, address, cityId })
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/settings/locations/page.tsx` | Server Component con tabs |
| `src/app/(dashboard)/settings/locations/actions.ts` | CRUD countries, cities, locations, bodegas |

---

## 10. Configuración — Usuarios

### Qué hace

Permite a los `SUPER_ADMIN` ver todos los usuarios registrados y cambiar sus roles.

> Solo los usuarios que han iniciado sesión al menos una vez aparecen aquí.

### Flujo — Cambiar rol

```
SUPER_ADMIN navega a /settings/users
        │
        ▼
Tabla de usuarios con columna "Cambiar Rol" (Select inline)
        │
        ▼
Selecciona nuevo rol desde el dropdown
        │
        ▼
Server Action: updateUserRole(userId, newRole)
  → user.update({ role: newRole })
  → Toast "Rol actualizado"
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/app/(dashboard)/settings/users/page.tsx` | Server Component |
| `src/app/(dashboard)/settings/users/actions.ts` | updateUserRole |
| `src/app/(dashboard)/settings/users/presentation/components/UsersTablePage.tsx` | Client con Select inline |

---

## 11. Importación masiva Excel

### Qué hace

Permite cargar cientos de activos o empleados desde un archivo `.xlsx` con validación previa y registro del resultado.

### Flujo completo

```
Usuario clic en "Importar Excel"
        │
        ▼
ExcelImportDialog se abre
        │
        ▼
Usuario sube archivo .xlsx
        │
        ▼
SheetJS (xlsx) parsea el archivo en el cliente
  → Convierte filas a objetos JS
        │
        ▼
parseRow() valida y transforma cada fila
  → Columnas faltantes → error por fila
        │
        ▼
Preview: tabla con filas OK / filas con error
  - Verde: listas para importar
  - Rojo: error con descripción
        │
        ▼
Usuario clic en "Confirmar importación"
        │
        ▼
Server Action: importAssetsAction(rows)
  Loop por fila:
    1. Busca/crea categoría por nombre
    2. Busca/crea location si viene
    3. $transaction: category.update + asset.create
       (mismo retry loop de 20 intentos para assetCode)
    4. Acumula errores por fila sin abortar el resto
        │
        ▼
Retorna: { inserted: N, skipped: M, errors: [...] }
        │
        ▼
Dialog muestra resumen: X insertados, Y con error
        │
        ▼
ImportLog guardado en DB para auditoría
```

### Columnas del Excel para activos

| Columna | Requerida | Descripción |
|---------|-----------|-------------|
| `category` | SÍ | Nombre exacto de la categoría |
| `brand` | No | Marca del equipo |
| `model` | No | Modelo |
| `serialNumber` | No | Número de serie |
| `hostname` | No | Hostname del equipo |
| `assetTag` | No | Código anterior (legacy) |
| `processor` | No | Procesador |
| `ram` | No | Memoria RAM |
| `storageCapacity` | No | Capacidad de almacenamiento |
| `storageType` | No | `SSD`, `HDD`, `NVME`, `EMMC` |
| `operatingSystem` | No | Sistema operativo |
| `purchasePrice` | No | Precio de compra |
| `currencyCode` | No | `COP`, `USD`, `EUR` |
| `usefulLifeYears` | No | Vida útil en años |
| `purchaseDate` | No | Fecha formato `YYYY-MM-DD` |
| `generalStatus` | No | `GOOD`, `REGULAR`, `BAD`, `DAMAGED`, `RETIRED` |
| `location` | No | Nombre de la sede |
| `bodega` | No | Nombre de la bodega |
| `notes` | No | Observaciones |

### Archivos clave

| Archivo | Función |
|---------|---------|
| `src/shared/ui/components/ExcelImportDialog.tsx` | Componente genérico reutilizable |
| `src/app/(dashboard)/assets/actions.ts` → `importAssetsAction` | Lógica de inserción masiva |

---

## Flujo global del sistema

```
                    ┌─────────────────────────────────────────┐
                    │              NOVAHOLD ERP                │
                    └─────────────────────────────────────────┘

  CONFIGURACIÓN (una sola vez)
  ────────────────────────────
  1. SUPER_ADMIN crea países → ciudades → sedes → bodegas
  2. SUPER_ADMIN crea categorías con fieldConfig y prefix
  3. SUPER_ADMIN sube empleados (Excel o formulario)
  4. SUPER_ADMIN asigna roles a los usuarios que se loguean

  OPERACIÓN DIARIA
  ────────────────
  5. ADMIN/TECHNICIAN crea activos (formulario o Excel masivo)
     → Sistema genera NVH-PC-00001 automáticamente
     → Activo queda en estado GOOD, sin asignar

  6. ADMIN/MANAGER asigna activo a empleado
     → Assignment ACTIVE se crea
     → El activo queda vinculado a persona y sede

  7. Si el activo se mueve físicamente:
     → ADMIN/TECHNICIAN registra traslado en Movimientos
     → La ubicación del activo se actualiza
     → Queda registro inmutable en el Kardex

  8. Si el empleado devuelve el activo:
     → Assignment pasa a RETURNED
     → Activo queda disponible para reasignar

  9. Si el activo se transfiere a otro empleado:
     → Assignment original → TRANSFERRED
     → Nueva Assignment → ACTIVE para el receptor

  ANÁLISIS
  ────────
  10. MANAGER/ADMIN consulta Analytics:
      → Ve el estado del inventario completo
      → Identifica activos depreciados o sin asignar
      → Revisa movimientos por sede
```
