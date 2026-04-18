# Product Release Document (PRD)
## Novahold Inventory ERP — Sistema de Gestión de Activos Tecnológicos

**Versión:** 1.0.0  
**Fecha:** 2026-04-18  
**Estado:** Aprobado — En desarrollo  
**Equipo responsable:** Tecnología  
**Autor:** Yuri Solandy Hoyos Marín — Líder TI  

---

## 1. Resumen Ejecutivo

Novahold gestiona actualmente su inventario de equipos de cómputo y activos tecnológicos en un archivo Excel que ha superado su capacidad operativa, generando inconsistencias, pérdida de trazabilidad y dificultades para el control de activos asignados.

Este documento describe los requerimientos, alcance y decisiones de diseño del sistema **Novahold Inventory ERP**: una aplicación web enterprise que reemplaza el Excel por un sistema centralizado, escalable y auditable, con autenticación corporativa, gestión de roles, trazabilidad completa, valoración financiera y generación de códigos QR para etiquetado físico.

---

## 2. Problema

| Síntoma | Impacto |
|---------|---------|
| Inventario en Excel sin control de versiones | Datos desactualizados, múltiples versiones en circulación |
| Sin historial de asignaciones | No se puede rastrear quién tuvo qué equipo y cuándo |
| Sin control de estado ni revisiones | Equipos en mal estado sin identificar |
| Sin valoración financiera | No se conoce el valor real del inventario ni su depreciación |
| Sin etiquetado físico estandarizado | Dificultad para identificar activos en campo |
| Acceso sin restricciones | Cualquier persona puede modificar el inventario |

---

## 3. Objetivos

1. **Centralizar** todo el inventario de activos tecnológicos en un sistema único y accesible desde cualquier dispositivo.
2. **Trazabilidad completa** de asignaciones, devoluciones, mantenimientos y cambios de estado.
3. **Autenticación corporativa** con cuentas de Outlook (@novahold.com) sin necesidad de contraseña adicional.
4. **Control de roles** para que cada usuario acceda solo a lo que le corresponde.
5. **Valoración financiera** con precio de compra, multi-moneda y cálculo de depreciación bajo NIIF.
6. **Etiquetado físico** mediante códigos QR únicos por activo, escaneables desde cualquier smartphone.
7. **Escalabilidad** para soportar nuevas sedes, países y tipos de activos sin rediseño.

---

## 4. Alcance v1.0

### 4.1 Incluido

- Gestión completa de activos (equipos, periféricos, ergonómicos, celulares empresa)
- Gestión de empleados con importación masiva por Excel
- Asignación y devolución de activos con historial
- Historial de mantenimientos y revisiones
- Generación de códigos QR y etiquetas imprimibles por activo
- Lector QR integrado en la app (acceso desde smartphone)
- Importación masiva de activos y empleados desde Excel
- Exportación de reportes a Excel y PDF
- Gestión de categorías con campos dinámicos (required/optional/hidden)
- Jerarquía de localización: País → Ciudad → Sede → Bodega
- Valoración financiera: precio de compra, multi-moneda, depreciación en línea recta
- Snapshots anuales de depreciación para contabilidad
- Dashboard con KPIs operativos y financieros
- Auditoría completa: log inmutable de todos los cambios
- Autenticación SSO con Microsoft (@novahold.com)
- Sistema de roles: SUPER_ADMIN, ADMIN, MANAGER, TECHNICIAN, VIEWER

### 4.2 Excluido de v1.0 (backlog)

- Integración con API de TRM (Banco de la República) para tipos de cambio automáticos
- App móvil nativa
- Integración con sistema contable externo (SAP, Siigo, etc.)
- Gestión de licencias de software
- Portal de solicitudes de activos por empleados
- Notificaciones por email/Teams al asignar o vencer garantías

---

## 5. Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Framework | Next.js 16.2.4 (App Router) | SSR/SSG, API routes integradas, file-based routing |
| Base de datos | MySQL 8+ | Relacional, amplio soporte en Colombia, familiar para el equipo |
| ORM | Prisma | Type-safe, migrations, DX superior |
| Auth | NextAuth.js v5 + Azure AD | SSO con Outlook corporativo, sin contraseñas adicionales |
| UI | shadcn/ui + Tailwind CSS | Componentes accesibles, altamente personalizables |
| Estado global | Zustand | Ligero, sin boilerplate, ideal para estado de UI |
| Formularios | React Hook Form + Yup | Performance, validación declarativa, DX |
| Tablas | TanStack Table v8 | Sort, filter, pagination sin rerender total |
| Códigos QR | qrcode + html5-qrcode | Generación y lectura de QR desde cámara |
| Excel | xlsx (SheetJS) | Import/export nativo sin dependencias externas |
| PDF | @react-pdf/renderer | Generación de etiquetas y reportes |
| Notificaciones | Sonner | Toast no intrusivos |

---

## 6. Arquitectura: Domain-Driven Design (DDD)

Cada módulo del sistema está estructurado en cuatro capas:

```
módulo/
├── domain/           → Entidades, value objects, interfaces de repositorios
├── application/      → Casos de uso, DTOs, servicios de aplicación
├── infrastructure/   → Implementaciones Prisma, mappers
└── presentation/     → Componentes React, hooks, schemas de validación
```

### 6.1 Módulos del sistema

| Módulo | Responsabilidad |
|--------|----------------|
| `auth` | Autenticación SSO, gestión de roles y permisos |
| `assets` | CRUD de activos, generación de códigos QR, importación Excel |
| `employees` | Gestión de empleados, importación Excel |
| `assignments` | Asignación y devolución de activos a empleados |
| `locations` | Jerarquía geográfica (País / Ciudad / Sede / Bodega) |
| `categories` | Categorías con configuración dinámica de campos |
| `maintenance` | Registro de revisiones y mantenimientos |
| `financials` | Monedas, tipos de cambio, cálculo de depreciación |
| `scanner` | Lector QR integrado por cámara |
| `audit` | Log de auditoría inmutable |
| `reports` | Dashboard KPIs y reportes exportables |
| `import` | Historial de importaciones masivas |

---

## 7. Modelo de Datos (entidades principales)

### Asset (Activo)
Campo central del sistema. Almacena todos los activos físicos: laptops, monitores, teclados, mouses, cargadores, celulares empresa, descansapiés, etc.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `assetCode` | String UNIQUE | Código físico de etiqueta: `NVH-PC-00001` |
| `assetTag` | String | ID heredado del Excel (ej: `ARCHAMSTA016`) |
| `hostname` | String | Nombre del equipo en red |
| `categoryId` | FK | Categoría que define los campos aplicables |
| `brand`, `model`, `serialNumber` | String | Identificación del equipo |
| `processor`, `ram`, `storageCapacity`, `storageType`, `operatingSystem` | String | Specs (visibles solo si la categoría los requiere) |
| `phoneNumber`, `imei` | String | Exclusivos para celulares empresa |
| `purchasePrice`, `currencyCode` | Decimal, String | Precio en moneda original |
| `purchasePriceBase` | Decimal | Precio convertido a COP (calculado automáticamente) |
| `salvageValue`, `usefulLifeYears` | Decimal, Int | Para cálculo de depreciación |
| `purchaseDate` | DateTime | Fecha de compra |
| `generalStatus`, `functionalStatus` | Enum | GOOD / REGULAR / BAD / DAMAGED / RETIRED |
| `parentAssetId` | FK self | Vincula accesorios a su equipo principal |
| `locationId`, `bodegaId` | FK | Ubicación física actual |

### Relación padre-hijo entre activos
Los accesorios son activos independientes que pueden vincularse a un equipo principal:
```
NVH-PC-00001 (Laptop ThinkPad)
  ├── NVH-MON-00012 (Monitor HP M24F)
  ├── NVH-KB-00008  (Teclado Logitech K220)
  └── NVH-MSE-00008 (Mouse Logitech M150)
```

### Category (Categoría)
Define qué campos del activo son `required`, `optional` o `hidden` para esa categoría.

```json
// Ejemplo: Computador Portátil
{
  "prefix": "PC",
  "defaultUsefulLife": 3,
  "fields": {
    "processor": "required",
    "ram": "required",
    "storageCapacity": "required",
    "operatingSystem": "required",
    "phoneNumber": "hidden",
    "imei": "hidden"
  }
}
```

### Categorías predefinidas del sistema

| Nombre | Prefijo | Vida útil (NIIF) |
|--------|---------|-----------------|
| Computador Portátil | PC | 3 años |
| Computador Escritorio | DSK | 4 años |
| Monitor | MON | 4 años |
| Teclado | KB | 3 años |
| Mouse | MSE | 3 años |
| Cargador | CHG | 3 años |
| Celular Empresa | PHN | 2 años |
| Disco Externo | EXT | 3 años |
| Adaptador RJ45 | RJ45 | 3 años |
| Diadema | HDST | 3 años |
| Ergonómico | ERG | 5 años |

---

## 8. Sistema de Códigos QR

### Formato del código
```
NVH-{CATEGORY_PREFIX}-{SEQUENCE:5}

Ejemplos:
  NVH-PC-00001    → Primer computador portátil
  NVH-MON-00042   → Monitor #42
  NVH-ERG-00003   → Tercer artículo ergonómico
```

### Flujo de uso
1. Al crear un activo, el sistema genera automáticamente el `assetCode` siguiente para esa categoría.
2. El QR codifica la URL completa del activo: `https://inventory.novahold.com/assets/NVH-PC-00001`
3. Desde el detalle del activo se puede **descargar/imprimir una etiqueta PDF** con el código + QR + nombre del equipo.
4. La app tiene una **página de scanner** (`/scanner`) que activa la cámara del dispositivo para leer el QR → redirige directamente al activo.
5. Cualquier empleado con acceso puede escanear para ver el estado y asignación del equipo en tiempo real.

---

## 9. Gestión Financiera

### Precio y monedas
- Precio de compra registrado en la **moneda original** del activo (COP, USD u otras).
- Al guardar, el sistema convierte automáticamente a **COP** usando el tipo de cambio vigente a la fecha de compra.
- La tabla `ExchangeRate` almacena el historial de tasas para reportes precisos en fechas pasadas.

### Depreciación (Línea Recta — NIIF)
```
Depreciación anual = (Precio compra COP - Valor residual COP) / Vida útil en años
Valor libro = Precio compra COP - (Depreciación anual × años transcurridos)
```

- El cálculo es **dinámico** (se computa en tiempo real, no se almacena).
- Los **snapshots anuales** se guardan en `DepreciationSnapshot` para auditoría contable.
- El detalle de cada activo muestra la **tabla completa año a año** de depreciación.
- El reporte financiero consolida el **valor total del inventario** y la **depreciación acumulada** en COP.

---

## 10. Autenticación y Roles

### SSO con Microsoft
- Login exclusivo con cuentas `@novahold.com` via Azure AD (Microsoft Entra ID).
- Sin contraseñas adicionales — el empleado usa su cuenta corporativa de Outlook.
- Primer login: usuario creado con rol `VIEWER` por defecto.
- SUPER_ADMIN asigna roles desde el panel de administración.

### Roles y permisos

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| SUPER_ADMIN | Acceso total | Todo + configuración del sistema, gestión de usuarios |
| ADMIN | Administrador | Crear/editar/eliminar activos, empleados, asignaciones |
| MANAGER | Gestor de área | Ver todo + asignar activos en su área |
| TECHNICIAN | Técnico | Crear/editar activos + registrar mantenimientos |
| VIEWER | Solo lectura | Ver activos, empleados, reportes |

---

## 11. Importación Masiva por Excel

### Activos
Template Excel con columnas:
`Categoría | Marca | Modelo | Serial | Hostname | Procesador | RAM | Disco | Tipo Disco | SO | Precio | Moneda | Vida Útil | Fecha Compra | Estado | Sede | Observaciones`

### Empleados
Template Excel con columnas:
`Nombre Completo | Email | Teléfono | Cargo | Departamento | Ciudad`

### Flujo de importación
1. Descargar template desde la app
2. Completar con los datos
3. Subir el archivo (drag & drop)
4. Preview con validación: filas ✅ OK y ❌ error con descripción del problema
5. Confirmar → inserción masiva en transacción
6. Registro en `ImportLog` con resumen de éxitos y errores
7. Descargar reporte de filas con error

---

## 12. Dashboard y Reportes

### KPIs del dashboard
- Total de activos / activos activos / activos dados de baja
- Activos asignados vs disponibles vs en bodega
- Distribución por categoría, sede y departamento
- Activos por estado (Bueno / Regular / Malo / Dañado)
- Valor total del inventario en COP
- Activos completamente depreciados
- Revisiones pendientes (sin revisión en los últimos 6 meses)

### Reportes exportables
- Inventario completo (con filtros aplicados) → Excel / PDF
- Reporte de asignaciones por empleado → Excel
- Historial de un activo específico → PDF
- Reporte de depreciación anual (para contabilidad) → Excel
- Activos por vencer vida útil → Excel

---

## 13. Fases de Desarrollo

| Fase | Descripción | Estado |
|------|-------------|--------|
| **Fase 1** | Scaffolding: proyecto Next.js, dependencias, Prisma schema, shadcn/ui | Pendiente |
| **Fase 2** | Auth: NextAuth + Azure AD + RBAC | Pendiente |
| **Fase 3** | Infraestructura compartida: layout, DataTable, ExcelImport, QRScanner | Pendiente |
| **Fase 4** | Módulos DDD: locations, categories, employees, assets, financials, assignments, maintenance, audit, scanner | Pendiente |
| **Fase 5** | Reportes, dashboard KPIs, seed con datos CSV | Pendiente |

---

## 14. Variables de Entorno Requeridas

```env
# Base de datos
DATABASE_URL="mysql://user:password@localhost:3306/novahold_inventory"

# NextAuth
NEXTAUTH_URL="https://inventory.novahold.com"
NEXTAUTH_SECRET="[generado con openssl rand -base64 32]"

# Azure AD (Microsoft Entra ID)
AZURE_AD_CLIENT_ID="[desde Azure Portal]"
AZURE_AD_CLIENT_SECRET="[desde Azure Portal]"
AZURE_AD_TENANT_ID="[desde Azure Portal]"

# App
NEXT_PUBLIC_APP_URL="https://inventory.novahold.com"
NEXT_PUBLIC_COMPANY_PREFIX="NVH"
```

---

## 15. Criterios de Aceptación (v1.0)

- [ ] Login con cuenta `@novahold.com` → accede al sistema sin contraseña adicional
- [ ] Login con dominio distinto → rechazado con mensaje claro
- [ ] Crear activo → código `NVH-PC-00001` generado automáticamente
- [ ] Detalle del activo → QR visible + botón "Imprimir etiqueta" funcional
- [ ] `/scanner` → cámara activa, escanear QR → redirige al activo correcto
- [ ] Importar Excel de activos → preview con validación → inserción masiva exitosa
- [ ] Importar Excel de empleados → misma validación y preview
- [ ] Asignar activo → `Assignment` creada + `AuditLog` registrado automáticamente
- [ ] Crear activo con precio en USD → precio en COP calculado correctamente
- [ ] Detalle financiero → tabla de depreciación año a año correcta (fórmula NIIF)
- [ ] Generar snapshot anual → guardado y visible en historial financiero
- [ ] Reporte de depreciación → exportable a Excel con datos correctos
- [ ] Dashboard → KPIs con datos reales del inventario
- [ ] SUPER_ADMIN puede cambiar roles de usuarios
- [ ] VIEWER no puede crear ni editar nada

---

## 16. Glosario

| Término | Definición |
|---------|-----------|
| **Activo** | Cualquier bien físico inventariable: laptop, monitor, teclado, descansapiés, etc. |
| **Asset code** | Código único de etiqueta generado por el sistema: `NVH-PC-00001` |
| **Asset tag** | ID heredado del Excel (ej: `ARCHAMSTA016`), conservado para compatibilidad |
| **Bodega** | Área de almacenamiento dentro de una sede para activos sin asignar |
| **Depreciación** | Pérdida de valor contable del activo con el tiempo (método línea recta bajo NIIF) |
| **Snapshot** | Fotografía del valor libro de un activo en una fecha determinada, para auditoría |
| **SSO** | Single Sign-On — login único con la cuenta corporativa de Outlook |
| **Valor libro** | Valor contable actual = Precio compra - Depreciación acumulada |
| **Valor residual** | Valor estimado del activo al final de su vida útil |
