# Prisma Schema — Novahold Inventory ERP

**Archivo:** `prisma/schema.prisma`  
**Base de datos:** MySQL 8+  
**ORM:** Prisma  

---

## Schema completo

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ═══════════════════════════════════════════════════════
// AUTH — NextAuth.js v5 + Azure AD
// ═══════════════════════════════════════════════════════

model User {
  id            String       @id @default(cuid())
  name          String?
  email         String       @unique
  emailVerified DateTime?
  image         String?
  role          UserRole     @default(VIEWER)
  employeeId    String?      @unique
  employee      Employee?    @relation(fields: [employeeId], references: [id])
  accounts      Account[]
  sessions      Session[]
  deliveries    Assignment[] @relation("DeliveredBy")
  auditLogs     AuditLog[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@map("users")
}

enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  TECHNICIAN
  VIEWER
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ═══════════════════════════════════════════════════════
// LOCALIZACIÓN — País → Ciudad → Sede → Bodega
// ═══════════════════════════════════════════════════════

model Country {
  id        String   @id @default(cuid())
  name      String   @unique
  code      String   @unique  // CO, US, VE, MX
  cities    City[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("countries")
}

model City {
  id        String     @id @default(cuid())
  name      String
  countryId String
  country   Country    @relation(fields: [countryId], references: [id])
  locations Location[]
  employees Employee[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@unique([name, countryId])
  @@map("cities")
}

model Location {
  // Sede física — reemplaza "Office"
  id        String     @id @default(cuid())
  name      String
  address   String?
  cityId    String
  city      City       @relation(fields: [cityId], references: [id])
  bodegas   Bodega[]
  employees Employee[]
  assets    Asset[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@map("locations")
}

model Bodega {
  id         String   @id @default(cuid())
  name       String
  locationId String
  location   Location @relation(fields: [locationId], references: [id])
  assets     Asset[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("bodegas")
}

// ═══════════════════════════════════════════════════════
// ORGANIZACIÓN — Departamentos y Empleados
// ═══════════════════════════════════════════════════════

model Department {
  id        String     @id @default(cuid())
  name      String     @unique
  employees Employee[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@map("departments")
}

model Employee {
  id           String       @id @default(cuid())
  fullName     String
  email        String       @unique
  phone        String?
  position     String?
  departmentId String?
  department   Department?  @relation(fields: [departmentId], references: [id])
  cityId       String?
  city         City?        @relation(fields: [cityId], references: [id])
  locationId   String?
  location     Location?    @relation(fields: [locationId], references: [id])
  isActive     Boolean      @default(true)
  user         User?
  assignments  Assignment[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@map("employees")
}

// ═══════════════════════════════════════════════════════
// FINANCIERO — Monedas y Tipos de Cambio
// ═══════════════════════════════════════════════════════

model Currency {
  id            String         @id @default(cuid())
  code          String         @unique  // COP, USD, EUR, VES, MXN
  name          String                  // Peso colombiano, Dólar estadounidense
  symbol        String                  // $, US$, €
  isBase        Boolean        @default(false)  // true = COP (moneda base)
  exchangeRates ExchangeRate[]
  assets        Asset[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@map("currencies")
}

model ExchangeRate {
  id            String   @id @default(cuid())
  currencyId    String
  currency      Currency @relation(fields: [currencyId], references: [id])
  rateToBase    Decimal  @db.Decimal(18, 6)  // 1 USD = 4200.000000 COP
  effectiveDate DateTime
  source        String?  // "manual" | "TRM" | "api"
  createdAt     DateTime @default(now())

  @@index([currencyId, effectiveDate])
  @@map("exchange_rates")
}

// ═══════════════════════════════════════════════════════
// CATEGORÍAS — Configuración dinámica de campos
// ═══════════════════════════════════════════════════════

model Category {
  id                String     @id @default(cuid())
  name              String     @unique
  // Prefijo para generar el assetCode: NVH-{prefix}-XXXXX
  prefix            String     @unique  // PC, MON, KB, MSE, CHG, PHN, EXT, ERG...
  description       String?
  // JSON que define visibilidad de campos por categoría:
  // { "processor": "required", "ram": "required", "phoneNumber": "hidden", ... }
  fieldConfig       Json?
  // Vida útil por defecto en años (NIIF): PC=3, MON=4, ERG=5, PHN=2
  defaultUsefulLife Int?
  sequence          Int        @default(0)  // último número usado → para generar el código
  parentId          String?
  parent            Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children          Category[] @relation("SubCategories")
  assets            Asset[]
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  @@map("categories")
}

// ═══════════════════════════════════════════════════════
// ACTIVOS — Tabla única para TODOS los activos físicos
// ═══════════════════════════════════════════════════════

model Asset {
  id               String      @id @default(cuid())
  // Código físico de etiqueta QR: NVH-PC-00001
  assetCode        String      @unique
  // ID heredado del Excel (ej: ARCHAMSTA016) — para migración
  assetTag         String?
  // Nombre del equipo en red (hostname)
  hostname         String?

  // ── Categoría ───────────────────────────────────────
  categoryId       String
  category         Category    @relation(fields: [categoryId], references: [id])

  // ── Identificación (required/optional según fieldConfig) ──
  brand            String?
  model            String?
  serialNumber     String?     @unique

  // ── Specs de cómputo (hidden para accesorios simples) ─
  processor        String?
  ram              String?
  storageCapacity  String?
  storageType      StorageType?
  operatingSystem  String?

  // ── Campos exclusivos para celulares empresa ─────────
  phoneNumber      String?
  imei             String?

  // ── Financiero ───────────────────────────────────────
  // Precio en moneda original del activo
  purchasePrice    Decimal?    @db.Decimal(15, 2)
  currencyCode     String?     @default("COP")
  currency         Currency?   @relation(fields: [currencyCode], references: [code])
  // Precio convertido a COP al momento de la compra (calculado automáticamente)
  purchasePriceBase Decimal?   @db.Decimal(15, 2)
  // Valor residual al final de la vida útil
  salvageValue     Decimal?    @db.Decimal(15, 2)
  // Override de Category.defaultUsefulLife para este activo específico
  usefulLifeYears  Int?

  // ── Estado y fechas ──────────────────────────────────
  purchaseDate     DateTime?
  generalStatus    AssetStatus @default(GOOD)
  functionalStatus AssetStatus @default(GOOD)
  lastRevision     DateTime?
  notes            String?     @db.Text

  // ── Ubicación ────────────────────────────────────────
  locationId       String?
  location         Location?   @relation(fields: [locationId], references: [id])
  bodegaId         String?
  bodega           Bodega?     @relation(fields: [bodegaId], references: [id])

  // ── Jerarquía padre-hijo (accesorios de un equipo) ───
  // Ej: teclado → parentAssetId → laptop
  parentAssetId    String?
  parentAsset      Asset?      @relation("AssetComponents", fields: [parentAssetId], references: [id])
  components       Asset[]     @relation("AssetComponents")

  // ── Campos extra específicos de la categoría ─────────
  metadata         Json?

  isActive                Boolean                @default(true)
  assignments             Assignment[]
  maintenances            Maintenance[]
  depreciationSnapshots   DepreciationSnapshot[]
  auditLogs               AuditLog[]
  createdAt               DateTime               @default(now())
  updatedAt               DateTime               @updatedAt

  @@map("assets")
}

enum StorageType {
  SSD
  HDD
  NVME
  EMMC
}

enum AssetStatus {
  GOOD      // Bueno
  REGULAR   // Regular
  BAD       // Malo
  DAMAGED   // Dañado / en reparación
  RETIRED   // Dado de baja
}

// ═══════════════════════════════════════════════════════
// ASIGNACIONES — Quién tiene qué equipo
// ═══════════════════════════════════════════════════════

model Assignment {
  id            String           @id @default(cuid())
  assetId       String
  asset         Asset            @relation(fields: [assetId], references: [id])
  employeeId    String
  employee      Employee         @relation(fields: [employeeId], references: [id])
  assignedAt    DateTime         @default(now())
  returnedAt    DateTime?
  deliveredById String?
  deliveredBy   User?            @relation("DeliveredBy", fields: [deliveredById], references: [id])
  status        AssignmentStatus @default(ACTIVE)
  notes         String?          @db.Text
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@map("assignments")
}

enum AssignmentStatus {
  ACTIVE
  RETURNED
  TRANSFERRED
}

// ═══════════════════════════════════════════════════════
// DEPRECIACIÓN — Snapshots anuales para contabilidad
// ═══════════════════════════════════════════════════════

// El cálculo de depreciación es dinámico (DepreciationService).
// Los snapshots se generan anualmente para auditoría contable.
model DepreciationSnapshot {
  id                  String   @id @default(cuid())
  assetId             String
  asset               Asset    @relation(fields: [assetId], references: [id])
  snapshotDate        DateTime // fecha del cálculo (ej: 31/12/2025)
  bookValueBase       Decimal  @db.Decimal(15, 2)  // valor libro en COP
  accumulatedDeprBase Decimal  @db.Decimal(15, 2)  // depreciación acumulada en COP
  annualDeprBase      Decimal  @db.Decimal(15, 2)  // depreciación del año en COP
  exchangeRateUsed    Decimal? @db.Decimal(18, 6)  // tasa usada si moneda != COP
  isFullyDepreciated  Boolean  @default(false)
  createdAt           DateTime @default(now())

  @@index([assetId, snapshotDate])
  @@map("depreciation_snapshots")
}

// ═══════════════════════════════════════════════════════
// MANTENIMIENTOS — Revisiones y reparaciones
// ═══════════════════════════════════════════════════════

model Maintenance {
  id          String          @id @default(cuid())
  assetId     String
  asset       Asset           @relation(fields: [assetId], references: [id])
  type        MaintenanceType
  description String?         @db.Text
  performedBy String?
  performedAt DateTime        @default(now())
  nextReview  DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@map("maintenances")
}

enum MaintenanceType {
  REVISION
  REPAIR
  UPGRADE
  CLEANING
}

// ═══════════════════════════════════════════════════════
// AUDITORÍA — Log inmutable de todos los cambios
// ═══════════════════════════════════════════════════════

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  assetId   String?
  asset     Asset?   @relation(fields: [assetId], references: [id])
  action    String   // CREATED | UPDATED | ASSIGNED | RETURNED | DELETED | IMPORTED
  entity    String   // Asset | Assignment | Employee | Maintenance | Category
  entityId  String
  before    Json?    // estado anterior (para comparar cambios)
  after     Json?    // estado nuevo
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([entityId, entity])
  @@index([assetId])
  @@index([userId])
  @@map("audit_logs")
}

// ═══════════════════════════════════════════════════════
// IMPORTACIONES — Historial de cargas masivas
// ═══════════════════════════════════════════════════════

model ImportLog {
  id          String       @id @default(cuid())
  userId      String
  entity      String       // Asset | Employee
  fileName    String
  totalRows   Int
  successRows Int
  errorRows   Int
  // [{ row: 3, field: "serialNumber", message: "Ya existe este serial" }]
  errors      Json?
  status      ImportStatus
  createdAt   DateTime     @default(now())

  @@map("import_logs")
}

enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## Diagrama de relaciones

```
Country ──< City ──< Location ──< Bodega
                        │
                     Employee >──< Assignment >── Asset
                        │                          │
                       User                     Category
                        │                          │
                     AuditLog            DepreciationSnapshot
                                                   │
                                              Maintenance
                                                   │
                                             ImportLog

Currency ──< ExchangeRate
    │
   Asset (currencyCode)
```

---

## Lógica de generación del assetCode

```typescript
// Al crear un activo:
// 1. Buscar la categoría y su prefix + sequence actual
// 2. Incrementar sequence en 1 (operación atómica con transacción)
// 3. Generar: `NVH-${category.prefix}-${String(sequence).padStart(5, '0')}`

async function generateAssetCode(categoryId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id: categoryId },
      data: { sequence: { increment: 1 } },
      select: { prefix: true, sequence: true },
    })
    const seq = String(category.sequence).padStart(5, '0')
    return `NVH-${category.prefix}-${seq}`
  })
}
// Resultado: NVH-PC-00001, NVH-MON-00042, NVH-ERG-00003
```

---

## Lógica de depreciación (Línea Recta)

```typescript
interface DepreciationResult {
  bookValue: number           // valor libro actual en COP
  annualDepreciation: number  // depreciación por año en COP
  accumulatedDepreciation: number
  remainingYears: number
  isFullyDepreciated: boolean
  schedule: Array<{           // tabla año a año
    year: number
    depreciation: number
    bookValue: number
  }>
}

function calculateDepreciation(asset: Asset, asDate = new Date()): DepreciationResult {
  const cost = asset.purchasePriceBase ?? 0
  const salvage = asset.salvageValue ?? 0
  const life = asset.usefulLifeYears ?? asset.category.defaultUsefulLife ?? 3
  const purchaseDate = asset.purchaseDate ?? asset.createdAt

  const yearsElapsed = differenceInYears(asDate, purchaseDate)
  const annualDepr = (cost - salvage) / life
  const accumulated = Math.min(annualDepr * yearsElapsed, cost - salvage)
  const bookValue = Math.max(cost - accumulated, salvage)

  return {
    bookValue,
    annualDepreciation: annualDepr,
    accumulatedDepreciation: accumulated,
    remainingYears: Math.max(life - yearsElapsed, 0),
    isFullyDepreciated: yearsElapsed >= life,
    schedule: Array.from({ length: life }, (_, i) => ({
      year: purchaseDate.getFullYear() + i + 1,
      depreciation: annualDepr,
      bookValue: Math.max(cost - annualDepr * (i + 1), salvage),
    })),
  }
}
```

---

## fieldConfig por categoría (valores posibles)

```typescript
type FieldVisibility = 'required' | 'optional' | 'hidden'

interface CategoryFieldConfig {
  brand?: FieldVisibility
  model?: FieldVisibility
  serialNumber?: FieldVisibility
  hostname?: FieldVisibility
  processor?: FieldVisibility
  ram?: FieldVisibility
  storageCapacity?: FieldVisibility
  storageType?: FieldVisibility
  operatingSystem?: FieldVisibility
  phoneNumber?: FieldVisibility
  imei?: FieldVisibility
  purchasePrice?: FieldVisibility
  purchaseDate?: FieldVisibility
  salvageValue?: FieldVisibility
  usefulLifeYears?: FieldVisibility
}

// Ejemplo categorías predefinidas:
const CATEGORY_CONFIGS: Record<string, CategoryFieldConfig> = {
  PC: {
    brand: 'required', model: 'required', serialNumber: 'required',
    hostname: 'required', processor: 'required', ram: 'required',
    storageCapacity: 'required', storageType: 'required', operatingSystem: 'required',
    purchasePrice: 'optional', phoneNumber: 'hidden', imei: 'hidden',
  },
  MON: {
    brand: 'required', model: 'required', serialNumber: 'optional',
    processor: 'hidden', ram: 'hidden', storageCapacity: 'hidden',
    operatingSystem: 'hidden', phoneNumber: 'hidden', imei: 'hidden',
  },
  PHN: {
    brand: 'required', model: 'required', serialNumber: 'optional',
    phoneNumber: 'required', imei: 'required',
    processor: 'hidden', ram: 'hidden', storageCapacity: 'hidden',
    operatingSystem: 'hidden',
  },
  ERG: {
    brand: 'optional', model: 'optional', serialNumber: 'optional',
    processor: 'hidden', ram: 'hidden', storageCapacity: 'hidden',
    operatingSystem: 'hidden', phoneNumber: 'hidden', imei: 'hidden',
  },
}
```

---

## Seed inicial

El seed carga automáticamente al ejecutar `npx prisma db seed`:

1. **Monedas**: COP (base), USD
2. **Tipos de cambio**: históricos aproximados 2022–2026
3. **País**: Colombia (CO)
4. **Ciudades**: Medellín, Pereira
5. **Locations (Sedes)**: Sede Medellín, Sede Pereira
6. **Departamentos**: Tecnología, Centro de servicios, Negocios, Inversiones, Dirección, Talento Humano
7. **Categorías** con fieldConfig y defaultUsefulLife: PC, DSK, MON, KB, MSE, CHG, PHN, EXT, RJ45, HDST, ERG
8. **Empleados**: ~40 registros del CSV original
9. **Activos**: todos los equipos del CSV con assetCode generado
10. **Accesorios**: vinculados como activos hijos (`parentAssetId`)
