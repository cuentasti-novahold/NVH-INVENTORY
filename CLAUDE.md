@AGENTS.md

# Novahold Inventory ERP — Agent Rules

**Full spec**: `PRD.md` · **Schema doc**: `SCHEMA.md`

---

## Skills Reference

| Context | Skill |
|---------|-------|
| Any UI/dashboard/panel work | `.claude/skills/interface-design/SKILL.md` |
| Next.js patterns, RSC, async APIs | `.claude/skills/next-best-practices/SKILL.md` |
| List/table page, columns, XxxTablePage | `skills/nextjs-16/main-page/SKILL.md` |
| Forms, CrudFormDialog, autocomplete | `skills/nextjs-16/form-builder/SKILL.md` |
| Pagination, filters, URL-driven tables | `skills/nextjs-16/pagination-filters/SKILL.md` |
| Tailwind classes, cn(), dynamic styles | `skills/tailwind-4/SKILL.md` |

**Rule**: Read the skill file BEFORE writing any code in that context. Multiple skills can apply simultaneously.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.2.4 App Router |
| DB | MySQL 8 + Prisma 7 |
| Auth | NextAuth v5 beta + Azure AD |
| UI | shadcn/ui + Tailwind CSS 4 |
| State | Zustand |
| Forms | React Hook Form + Yup |
| Tables | TanStack Table v8 |
| QR | `qrcode` (gen) + `html5-qrcode` (scan) |
| Excel | `xlsx` (SheetJS) |
| Notifications | Sonner |
| Icons | Lucide React |
| Package manager | pnpm |

---

## CRITICAL RULES

```
NEVER  url in schema.prisma — Prisma 7: url lives in prisma.config.ts only
NEVER  "use client" in page.tsx — Server Component shell only
NEVER  manual <form> + useState — always CrudFormDialog + FormConfig
NEVER  var() in className — use Tailwind semantic classes
NEVER  hex colors in className — use Tailwind color classes
ALWAYS actions column inline in XxxTablePage, never in columns file
ALWAYS close dialog only in onSuccess callback of mutation
ALWAYS field.name must match backend DTO field name exactly
ALWAYS searchAction in autocompleteConfig must be a Server Action
ALWAYS all user-facing strings in Spanish
ALWAYS pnpm (not npm/yarn)
```

---

## Architecture Decision Tree

```
New module?           → DDD: domain/ app/ infra/ presentation/ per module
New list page?        → page.tsx (Server) + XxxTablePage (Client) + hook + actions
New form?             → FormConfig in presentation/forms/ → CrudFormDialog
Need API search?      → type: "autocomplete" + Server Action
Need DB query?        → Server Component fetch OR Server Action (never Route Handler for simple CRUD)
New entity?           → single Asset table — Category.fieldConfig controls field visibility
Auth guard?           → middleware.ts + hasPermission(role, action, resource)
```

---

## Module Structure (DDD)

```
src/app/(dashboard)/{module}/
  page.tsx                              ← Server Component, no logic
  presentation/
    components/{Module}TablePage.tsx    ← "use client", full CRUD
    components/columns-{module}.tsx     ← "use client", display only
    forms/{module}-form.config.ts       ← plain TS, no directive
    hooks/use-{module}s.ts

src/modules/{module}/
  domain/
    entities/{Entity}.ts
    repositories/I{Entity}Repository.ts
  application/
    use-cases/
    dtos/
  infrastructure/
    repositories/Prisma{Entity}Repository.ts
    mappers/{Entity}Mapper.ts
```

---

## Key Patterns

### Asset Code Generation (atomic)

```typescript
// ALWAYS use $transaction to avoid race conditions
const [updated, asset] = await prisma.$transaction([
  prisma.category.update({
    where: { id: categoryId },
    data: { sequence: { increment: 1 } },
    select: { sequence: true, prefix: true },
  }),
  // then create with assetCode: `NVH-${prefix}-${seq.toString().padStart(5, '0')}`
]);
```

### Depreciation (dynamic — never stored except snapshots)

```typescript
// DepreciationService.calculate(asset, asDate)
const years = differenceInYears(asDate, asset.purchaseDate);
const annualDepr = (purchasePriceBase - salvageValue) / usefulLifeYears;
const accumulated = Math.min(annualDepr * years, purchasePriceBase - salvageValue);
const bookValue = purchasePriceBase - accumulated;
```

### Auth Domain Restriction

```typescript
// NextAuth v5 — only @novahold.com emails
callbacks: {
  async signIn({ account, profile }) {
    if (account?.provider === "azure-ad")
      return profile?.email?.endsWith("@novahold.com") ?? false;
    return false;
  }
}
```

### Asset fieldConfig Hierarchy

```
Category.fieldConfig: { "processor": "required" | "optional" | "hidden" }
→ Drives: form validation (Yup), form rendering, table columns visibility
→ Phone/IMEI: "hidden" for all except PHN (Celular Empresa)
→ Processor/RAM/Storage/OS: "hidden" for ERG, KB, MSE, etc.
```

### RBAC

```typescript
// permissions.ts
const PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['assets:*', 'employees:*', 'assignments:*', 'categories:*', 'locations:*'],
  MANAGER: ['assets:read', 'employees:read', 'assignments:create'],
  TECHNICIAN: ['assets:create', 'assets:update', 'maintenance:*'],
  VIEWER: ['assets:read', 'employees:read'],
};
```

---

## Asset Categories & Prefixes

| Category | Prefix | Key hidden fields |
|----------|--------|-------------------|
| Computador Portátil | PC | phoneNumber, imei |
| Computador Escritorio | DSK | phoneNumber, imei |
| Monitor | MON | processor, ram, storage, os, phone, imei |
| Teclado | KB | processor, ram, storage, os, phone, imei |
| Mouse | MSE | processor, ram, storage, os, phone, imei |
| Cargador | CHG | processor, ram, storage, os, phone, imei |
| Celular Empresa | PHN | processor, ram, storage, os |
| Disco Externo | EXT | processor, ram, os, phone, imei |
| Adaptador RJ45 | RJ45 | all specs + phone/imei |
| Diadema | HDST | all specs + phone/imei |
| Ergonómico | ERG | all specs + phone/imei |

---

## Shared Components

| Component | Import | Use |
|-----------|--------|-----|
| `PageHeader` | `@/components/dashboard/PageHeader` | Actions bar (filter/import/create) |
| `MainDataTable` | `@/components/tables/MainTable` | Paginated TanStack table |
| `TableSkeleton` | `@/components/tables/TableSkeleton` | Loading state |
| `Show` | `@/components/show/Show.component` | Conditional render |
| `CrudFormDialog` | `@/shared/presentation/components/form-builder/CrudFormDialog` | Create/edit dialog |
| `ExcelImportDialog` | `@/components/import/excel-import-dialog` | Bulk import |
| `QRScanner` | `@/shared/ui/components/QRScanner` | Camera QR reader |

---

## User Roles

```
SUPER_ADMIN → full access + system config + user role management
ADMIN       → full asset/employee/assignment management
MANAGER     → read all + assign in their area
TECHNICIAN  → create/edit assets + maintenance records
VIEWER      → read only
```

Default on first login: `VIEWER`. SUPER_ADMIN upgrades via `/settings/users`.

---

## Project Commands

```bash
pnpm dev           # dev server
pnpm build         # production build
pnpm lint          # ESLint
npx prisma migrate dev --name <name>   # new migration
npx prisma db seed                     # seed with CSV data
npx prisma studio                      # DB GUI
```

---

## Known Issues

- **Prisma 7**: NO `url` in `schema.prisma` datasource — only in `prisma.config.ts`
- **pnpm build scripts**: `.npmrc` must have `approve-builds=@prisma/engines,prisma,@prisma/client`
- **NextAuth v5 beta**: import from `next-auth` not `next-auth/next`; config export changed
- **QR scanner**: `html5-qrcode` requires `"use client"` + dynamic import (no SSR)
- **Excel import**: `xlsx` must be used server-side only (Route Handler or Server Action)

---

## QA Checklist

- [ ] `@novahold.com` login succeeds → dashboard; other domain → rejected
- [ ] Asset create → `assetCode` generated `NVH-{PREFIX}-XXXXX` (no gaps, atomic)
- [ ] Asset with accessories → parent-child tree renders correctly
- [ ] QR scan → redirects to correct asset detail page
- [ ] Excel import → row-level validation preview → bulk insert → ImportLog saved
- [ ] Assign asset to employee → Assignment created + AuditLog recorded
- [ ] Asset with USD price → `purchasePriceBase` stored in COP
- [ ] Depreciation table on asset detail → dynamic, matches formula
- [ ] Annual snapshot generation → saved to `DepreciationSnapshot`
- [ ] VIEWER cannot create/edit → 403
- [ ] TECHNICIAN cannot delete assets → 403
