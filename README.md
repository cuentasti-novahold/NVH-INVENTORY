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

---

## Producción — EC2 MySQL

La app corre en Vercel Hobby conectada a MySQL 8 en una instancia EC2 (Amazon Linux 2023).
La seguridad de la conexión descansa en **mTLS**: el usuario `novahold_app` tiene `REQUIRE X509`,
lo que significa que MySQL rechaza cualquier conexión que no presente un certificado de cliente
firmado por la CA privada del proyecto — independientemente de que la contraseña sea correcta.

### Renovación de certificados

Los certificados generados en la configuración inicial vencen en **3650 días (~10 años)**.
Cuando se acerque la fecha, generar un nuevo certificado de cliente en la EC2:

```bash
cd ~/certs

# Generar nuevo cert de cliente (incrementar serial: 03, 04, etc.)
openssl req -newkey rsa:2048 -nodes -keyout client-key.pem -out client-req.pem \
  -subj "/CN=novahold-app-client"

openssl x509 -req -days 3650 \
  -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 03 \
  -in client-req.pem -out client-cert.pem
```

Luego actualizar en Vercel:
- `DB_SSL_CERT` → contenido del nuevo `client-cert.pem`
- `DB_SSL_KEY` → contenido del nuevo `client-key.pem`

Hacer redeploy. El `ca-cert.pem` y los certs del servidor **no cambian**.

> `ca-key.pem` en `~/certs/` es la llave privada de la CA. Si se pierde, no se pueden
> generar nuevos certificados de cliente. Guardarlo en un lugar seguro fuera del servidor.

---

### Backups

Los backups se generan directamente en la EC2 con `mysqldump` y se comprimen con gzip.

#### Crear usuario de backup (una sola vez)

Conectarse a MySQL (`sudo mysql -u root -p`) y ejecutar:

```sql
CREATE USER 'novahold_backup'@'127.0.0.1'
  IDENTIFIED BY '<contraseña-segura>';

GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER
ON novahold.* TO 'novahold_backup'@'127.0.0.1';

FLUSH PRIVILEGES;
```

Este usuario solo acepta conexiones desde localhost — nunca desde internet.

#### Crear el script de backup

```bash
sudo mkdir -p /opt/backups
sudo nano /opt/backups/backup-novahold.sh
```

Contenido:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y-%m-%d)
FILENAME="novahold-${DATE}.sql.gz"

mysqldump \
  -h 127.0.0.1 \
  -u novahold_backup \
  -p'<contraseña-segura>' \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  novahold | gzip > "${BACKUP_DIR}/${FILENAME}"

# Eliminar backups con más de 90 días
find "${BACKUP_DIR}" -name "novahold-*.sql.gz" -mtime +90 -delete

echo "Backup completado: ${BACKUP_DIR}/${FILENAME}"
```

```bash
sudo chmod +x /opt/backups/backup-novahold.sh
```

#### Probar el script

```bash
sudo /opt/backups/backup-novahold.sh
ls -lh /opt/backups/
# debe aparecer: novahold-YYYY-MM-DD.sql.gz
```

#### Programar cron mensual (día 1 de cada mes a las 2 AM)

En Amazon Linux, instalar y habilitar cronie primero:

```bash
sudo dnf install -y cronie
sudo systemctl enable crond
sudo systemctl start crond
```

Abrir el editor de cron:

```bash
sudo crontab -e
```

Agregar esta línea (formato vi: `i` para insertar, `Esc` + `:wq` + `Enter` para guardar):

```
0 2 1 * * /opt/backups/backup-novahold.sh >> /var/log/novahold-backup.log 2>&1
```

**Qué hace el cron job**: el día 1 de cada mes a las 2 AM UTC, la EC2 ejecuta el script
automáticamente sin intervención manual. Genera el archivo comprimido con la fecha en el
nombre, borra los backups con más de 90 días y registra el resultado en el log.

**Formato cron** — los 5 campos significan:

```
0 2 1 * *
│ │ │ │ └── día de la semana (0-7, * = todos)
│ │ │ └──── mes (1-12, * = todos)
│ │ └────── día del mes (1-31)
│ └──────── hora (0-23)
└────────── minuto (0-59)
```

Verificar que quedó registrado:

```bash
sudo crontab -l
```

Ver el log después de la primera ejecución:

```bash
cat /var/log/novahold-backup.log
```

#### Descargar el backup a tu máquina

Desde tu terminal local (Mac/Linux):

```bash
# Listar backups disponibles en la EC2
ssh -i <tu-key.pem> ec2-user@<ELASTIC_IP> "ls -lh /opt/backups/"

# Descargar el más reciente al escritorio
LAST=$(ssh -i <tu-key.pem> ec2-user@<ELASTIC_IP> \
  "ls -t /opt/backups/novahold-*.sql.gz | head -1")
scp -i <tu-key.pem> ec2-user@<ELASTIC_IP>:"${LAST}" ~/Desktop/
```

Desde Windows (PowerShell):

```powershell
scp -i C:\Users\TuUsuario\.ssh\tu-key.pem `
  ec2-user@<ELASTIC_IP>:/opt/backups/novahold-YYYY-MM-DD.sql.gz `
  C:\Users\TuUsuario\Desktop\
```

#### Restaurar un backup

```bash
# En la EC2
zcat /opt/backups/novahold-YYYY-MM-DD.sql.gz | \
  mysql -h 127.0.0.1 -u novahold_backup -p novahold
```
