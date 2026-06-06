# Novahold Inventory ERP

Sistema de gestión de inventario tecnológico para activos de empresa — equipos, periféricos y accesorios. Construido con Next.js 16 App Router, Prisma 7, MySQL 8 y autenticación corporativa vía Azure AD.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.4 — App Router + RSC |
| Base de datos | MySQL 8 + Prisma 7 |
| Autenticación | NextAuth v5 beta + Azure AD (OAuth2) |
| UI | shadcn/ui + Tailwind CSS 4 + Base UI |
| Tablas | TanStack Table v8 |
| Formularios | React Hook Form + Yup |
| Gráficos | Recharts 3 (via shadcn/chart) |
| QR | `qrcode` (generación) + `html5-qrcode` (escaneo) |
| Excel | SheetJS / `xlsx` |
| Notificaciones | Sonner |
| Íconos | Lucide React |
| Testing | Vitest + Testing Library |
| E2E | Playwright |
| Package manager | pnpm |

---

## Requisitos previos

- Node.js 20+
- pnpm 9+
- MySQL 8 corriendo localmente o en Docker
- Aplicación registrada en Azure AD con permisos de email/profile

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone <url>
cd novahold-inventory

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Ejecutar migraciones
npx prisma migrate dev

# 5. Cargar datos iniciales (categorías, monedas, países)
npx prisma db seed

# 6. Iniciar servidor de desarrollo
pnpm dev
```

---

## Variables de entorno

```env
# Base de datos
DATABASE_URL="mysql://user:password@localhost:3306/novahold"

# Certificados mTLS (producción — EC2)
DB_SSL_CA="-----BEGIN CERTIFICATE-----\n..."
DB_SSL_CERT="-----BEGIN CERTIFICATE-----\n..."
DB_SSL_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

# NextAuth
AUTH_SECRET="<openssl rand -base64 33>"
NEXTAUTH_URL="http://localhost:3000"

# Azure AD
AZURE_AD_CLIENT_ID="<client-id>"
AZURE_AD_CLIENT_SECRET="<client-secret>"
AZURE_AD_TENANT_ID="<tenant-id>"
```

> En desarrollo, `DB_SSL_CA/CERT/KEY` no son necesarias — la conexión sin TLS aplica solo en `NODE_ENV=development`.

---

## Comandos disponibles

```bash
pnpm dev                    # Servidor de desarrollo en http://localhost:3000
pnpm build                  # Build de producción
pnpm lint                   # ESLint
pnpm test:unit              # Tests unitarios (Vitest)
pnpm test:watch             # Tests en modo watch
pnpm test:coverage          # Cobertura de tests
pnpm test:e2e               # Tests E2E (Playwright)

npx prisma migrate dev --name <nombre>   # Nueva migración
npx prisma db seed                        # Seed de datos iniciales
npx prisma studio                         # GUI de base de datos
```

---

## Roles y permisos (RBAC)

La jerarquía de roles es `SUPER_ADMIN > ADMIN > MANAGER > TECHNICIAN > VIEWER`. El rol por defecto al primer login es `VIEWER` — un `SUPER_ADMIN` lo cambia desde `/settings/users`.

### Matriz de permisos por recurso

| Recurso | SUPER_ADMIN | ADMIN | MANAGER | TECHNICIAN | VIEWER |
|---------|:-----------:|:-----:|:-------:|:----------:|:------:|
| **Activos** | todo | todo | leer | leer, crear, editar | leer |
| **Empleados** | todo | todo | leer | leer | leer |
| **Asignaciones** | todo | todo | crear | — | — |
| **Mantenimiento** | todo | todo | leer | leer, crear, editar | leer |
| **Traslados** | todo | todo | leer, crear | leer, crear | leer |
| **Categorías** | todo | todo | leer | leer | leer |
| **Sedes / bodegas** | todo | todo | leer | leer | leer |
| **Departamentos** | todo | todo | leer | leer | leer |
| **Monedas** | todo | todo | leer | leer | leer |
| **Usuarios** | todo | — | — | — | — |

> **todo** = leer + crear + editar + eliminar  
> **—** = sin acceso (el Server Action devuelve `FORBIDDEN`)

### Detalle por rol

**`SUPER_ADMIN`** — Acceso irrestricto a todos los recursos y acciones. Único rol que puede gestionar usuarios y cambiar roles.

**`ADMIN`** — CRUD completo sobre activos, empleados, asignaciones, categorías, sedes, mantenimiento, traslados, monedas y departamentos. No puede gestionar usuarios.

**`MANAGER`** — Lectura de todos los recursos operativos + puede crear asignaciones y traslados. No puede crear ni editar activos, empleados ni mantenimientos.

**`TECHNICIAN`** — Orientado a operaciones de campo: puede leer y registrar activos, crear y actualizar mantenimientos, registrar traslados. Puede ver empleados pero no modificarlos. No puede eliminar nada ni gestionar asignaciones.

**`VIEWER`** — Solo lectura de activos, empleados, categorías, sedes, traslados, mantenimientos, monedas y departamentos. No puede crear ni modificar nada.

### Acceso al sistema

Solo pueden autenticarse usuarios cuya cuenta Microsoft pertenezca al tenant Azure AD configurado en `AZURE_AD_TENANT_ID`. La verificación es criptográfica (claim `tid`) — no se puede falsificar con un email similar.

---

## Estructura del proyecto

```
novahold-inventory/
├── prisma/
│   ├── schema.prisma          # Modelos de datos
│   └── seed.ts                # Datos iniciales
│
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Rutas protegidas del ERP
│   │   │   ├── page.tsx               # Dashboard home / KPIs
│   │   │   ├── assets/                # Módulo activos
│   │   │   │   └── [assetCode]/       # Detalle individual de activo
│   │   │   │       ├── page.tsx                        # Server Component — fetch por assetCode
│   │   │   │       └── presentation/
│   │   │   │           ├── AssetDetailView.tsx          # Vista completa + depreciación + historial
│   │   │   │           ├── AssetLabelDownload.tsx        # Descarga etiqueta PDF
│   │   │   │           └── AssetHistoryDownload.tsx      # Descarga historial PDF
│   │   │   ├── scanner/               # Lector QR con cámara
│   │   │   ├── employees/             # Módulo empleados
│   │   │   ├── assignments/           # Módulo asignaciones
│   │   │   ├── movimientos/           # Módulo traslados (Kardex)
│   │   │   ├── analytics/             # Módulo analytics
│   │   │   └── settings/              # Configuración
│   │   │       ├── categories/        # Categorías de activos
│   │   │       ├── locations/         # Sedes y bodegas
│   │   │       └── users/             # Gestión de usuarios
│   │   └── login/                     # Página de autenticación
│   │
│   ├── components/
│   │   ├── ui/                # Componentes shadcn/ui
│   │   ├── dashboard/         # PageHeader, sidebar
│   │   ├── tables/            # MainDataTable, TableSkeleton
│   │   └── show/              # Show (renderizado condicional)
│   │
│   ├── shared/
│   │   ├── presentation/
│   │   │   └── components/
│   │   │       └── form-builder/
│   │   │           └── CrudFormDialog.tsx   # Diálogo genérico — soporta 16 tipos de campo
│   │   └── ui/
│   │       └── components/
│   │           ├── ExcelExportButton.tsx    # Descarga base64 → .xlsx
│   │           ├── AssetQRCode.tsx          # QR generado client-side (qrcode)
│   │           ├── AssetLabel.tsx           # Etiqueta imprimible (@react-pdf/renderer)
│   │           └── AssetHistoryPDF.tsx      # PDF de historial de asignaciones
│   │
│   ├── modules/               # Lógica de dominio (DDD)
│   │   └── {módulo}/
│   │       ├── domain/
│   │       ├── application/
│   │       └── infrastructure/
│   │
│   ├── auth.ts                # Configuración NextAuth
│   ├── auth.config.ts         # Callbacks OAuth
│   └── lib/
│       ├── prisma.ts          # Cliente Prisma singleton
│       ├── permissions.ts     # Matriz RBAC
│       ├── depreciation.ts    # calculateDepreciation — lógica NIIF en línea recta
│       └── utils.ts           # cn(), helpers
│
└── openspec/                  # Especificaciones de features (SDD)
```

---

## Diagrama Entidad-Relación

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║  AUTH                                                                            ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║  ┌──────────┐  1:N  ┌──────────┐        ┌─────────────────────┐                ║
║  │   User   │──────►│ Account  │        │  VerificationToken   │                ║
║  │──────────│       │──────────│        └─────────────────────┘                ║
║  │ id       │       │ userId   │                                                ║
║  │ name     │  1:N  │ provider │        ┌──────────┐                           ║
║  │ email    │──────►│ Session  │        │ expires  │                           ║
║  │ role     │       └──────────┘        └──────────┘                           ║
║  │employeeId│                                                                   ║
║  └────┬─────┘                                                                   ║
║       │ 0..1 ↔ 1 (Employee)                                                    ║
╚═══════╪════════════════════════════════════════════════════════════════════════╝ ║
        │                                                                          
╔═══════╪════════════════════════════════════════════════════════════════════════╗
║  ORGANIZACIÓN                                                                   ║
╠═══════╪════════════════════════════════════════════════════════════════════════╣
║       ▼                                                                         ║
║  ┌────────────┐  N:1  ┌────────────┐                                           ║
║  │  Employee  │──────►│ Department │                                            ║
║  │────────────│       └────────────┘                                            ║
║  │ id         │                                                                 ║
║  │ fullName   │  N:1  ┌──────────┐  N:1  ┌─────────┐  N:1  ┌─────────┐       ║
║  │ email      │──────►│ Location │──────►│  City   │──────►│ Country │       ║
║  │ position   │       │──────────│       └─────────┘       └─────────┘       ║
║  │ isActive   │       │ name     │                                             ║
║  │ cityId     │──────►│ address  │  1:N  ┌─────────┐                          ║
║  └────────────┘  N:1  └──────────┘──────►│ Bodega  │                          ║
║                                          └─────────┘                           ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════╗
║  CATÁLOGO                                                                      ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  ┌──────────────┐  auto-ref  ┌──────────────┐                                 ║
║  │   Category   │───────────►│   Category   │  (padre → hijo)                 ║
║  │──────────────│  N:1       └──────────────┘                                 ║
║  │ id           │                                                              ║
║  │ name         │  fieldConfig (JSON) → controla visibilidad de campos         ║
║  │ prefix       │  sequence  (INT)    → genera assetCode atómico              ║
║  │ fieldConfig  │                                                              ║
║  │ sequence     │                                                              ║
║  └──────────────┘                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════╗
║  FINANCIERO                                                                    ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  ┌──────────┐  1:N  ┌──────────────┐                                          ║
║  │ Currency │──────►│ ExchangeRate │                                           ║
║  │──────────│       │──────────────│                                           ║
║  │ code     │       │ rateToBase   │  (historial TRM por fecha efectiva)       ║
║  │ isBase   │       │ effectiveDate│                                           ║
║  └──────────┘       └──────────────┘                                           ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════╗
║  ACTIVOS — tabla central del sistema                                           ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║         ┌────────────────────────────────────────────────────────┐            ║
║         │                       Asset                             │            ║
║         │────────────────────────────────────────────────────────│            ║
║         │ id                                                       │            ║
║         │ assetCode          → único, ej: NVH-PC-00001            │            ║
║         │ categoryId         → Category                           │            ║
║         │ brand · model · serialNumber                            │            ║
║         │ processor · ram · storageCapacity · storageType         │ specs      ║
║         │ operatingSystem                                          │            ║
║         │ phoneNumber · imei                                       │ celulares  ║
║         │ purchasePrice · currencyCode → Currency                 │            ║
║         │ purchasePriceBase · salvageValue · usefulLifeYears       │ financiero ║
║         │ purchaseDate                                             │            ║
║         │ generalStatus · functionalStatus                         │ estado     ║
║         │ locationId → Location                                    │            ║
║         │ bodegaId   → Bodega                                      │ ubicación  ║
║         │ parentAssetId → Asset (self-ref: componentes)           │            ║
║         │ isActive · notes · metadata                             │            ║
║         └─────────────────────────┬──────────────────────────────┘            ║
║                                   │ 1:N                                       ║
║          ┌──────────┬─────────────┼──────────────┬──────────────┐            ║
║          ▼          ▼             ▼              ▼              ▼             ║
║  ┌────────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐  ║
║  │ Assignment │ │Maintenance│ │Depreciation  │ │AssetMove-│ │AuditLog  │  ║
║  │────────────│ │───────────│ │Snapshot      │ │ment      │ │──────────│  ║
║  │ assetId    │ │ assetId   │ │──────────────│ │──────────│ │ assetId  │  ║
║  │ employeeId │ │ type      │ │ snapshotDate │ │fromLocId │ │ action   │  ║
║  │ assignedAt │ │ performedAt│ │ bookValueBase│ │toLocId   │ │ entity   │  ║
║  │ returnedAt │ │ nextReview│ │ annualDepr   │ │moveType  │ │ before   │  ║
║  │ status     │ └───────────┘ └──────────────┘ │movedById │ │ after    │  ║
║  └─────┬──────┘                                └──────────┘ └──────────┘  ║
║        │ N:1                                                                ║
║        ▼                                                                    ║
║  ┌────────────┐                                                             ║
║  │  Employee  │                                                             ║
║  └────────────┘                                                             ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════╗
║  IMPORTACIONES                                                                 ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  ┌──────────────┐                                                              ║
║  │  ImportLog   │  (independiente — historial de cargas masivas)               ║
║  │──────────────│                                                              ║
║  │ userId       │                                                              ║
║  │ entity       │                                                              ║
║  │ fileName     │                                                              ║
║  │ totalRows    │                                                              ║
║  │ successRows  │                                                              ║
║  │ status       │                                                              ║
║  └──────────────┘                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

---

## Generación de códigos de activo

El código `NVH-{PREFIX}-{SECUENCIA}` es atómico y sin huecos:

```
Categoría: prefix="PC", sequence=42
→ assetCode = "NVH-PC-00043"
```

Implementación con `$transaction`: incrementa el `sequence` de la categoría y crea el activo en una sola operación. Si hay colisión por desincronización, reintenta automáticamente hasta 20 veces.

---

## Depreciación

Calculada dinámicamente (nunca almacenada, salvo snapshots anuales):

```
Depreciación anual    = (Precio base COP − Valor residual) / Vida útil (años)
Depreciación acumulada = min(depAnual × años transcurridos, precioBase − valorResidual)
Valor en libros        = Precio base − Depreciación acumulada
```

Los snapshots anuales se guardan en `DepreciationSnapshot` para auditoría contable.

---

## Detalle de activo y QR

Cada activo tiene su propia URL: `/assets/NVH-PC-00001`

- Vista completa de todos los campos, asignación activa y tabla de depreciación año a año.
- **Código QR** generado client-side con `qrcode` — codifica la URL del activo.
- **Etiqueta PDF** imprimible con QR + nombre + código (`@react-pdf/renderer`).
- **Historial PDF** de todas las asignaciones del activo, descargable desde la misma vista.

---

## Scanner QR

`/scanner` activa la cámara del dispositivo (via `html5-qrcode`), lee el QR y redirige directamente al activo escaneado. Funciona desde cualquier smartphone con acceso a la app.

---

## Exportación a Excel

Server Actions que generan archivos `.xlsx` con SheetJS y los serializan en base64 para descargar desde el cliente:

| Reporte | Server Action |
|---------|--------------|
| Inventario completo | `exportInventoryAction` |
| Depreciación anual | `exportDepreciationAction` |
| Activos por vencer vida útil | `exportExpiringAction` |
| Asignaciones activas | `exportAssignmentsAction` |

El componente `ExcelExportButton` decodifica el base64 y dispara la descarga nativa del browser.

---

## Importación masiva (Excel)

1. Usuario sube archivo `.xlsx`
2. SheetJS parsea fila por fila en el servidor
3. Preview con filas válidas / inválidas
4. Confirmación → insert masivo + registro en `ImportLog`

---

## Autenticación y acceso

- Proveedor: Azure AD (Microsoft Entra ID) vía NextAuth v5
- Acceso restringido al tenant configurado en `AZURE_AD_TENANT_ID` — verificación por claim criptográfico `tid`
- Primer login → rol `VIEWER` asignado automáticamente
- `SUPER_ADMIN` cambia roles desde `/settings/users` — el cambio aplica en el siguiente login o al refrescar la sesión
- Middleware protege todas las rutas `/(dashboard)/*`

---

## Documentación adicional

- [`MODULES.md`](./MODULES.md) — Descripción detallada de cada módulo y sus flujos
