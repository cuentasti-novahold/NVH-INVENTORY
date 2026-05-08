# Novahold Inventory ERP — Agent Rules

**Full spec**: `PRD.md` · **Schema doc**: `SCHEMA.md` · **In-flight changes**: `openspec/changes/`

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
| Auth | NextAuth v5 beta + Azure AD (`@novahold.com` only) |
| UI | shadcn/ui + Tailwind CSS 4 |
| State | Zustand |
| Forms | React Hook Form + Yup |
| Tables | TanStack Table v8 |
| QR | `qrcode` (gen) + `html5-qrcode` (scan) |
| Excel | `xlsx` (SheetJS, server-side only) |
| Notifications | Sonner |
| Icons | Lucide React |
| Package manager | pnpm |

---

## CRITICAL RULES

```
NEVER  url in schema.prisma — Prisma 7: url lives in prisma.config.ts only
NEVER  "use client" in page.tsx — Server Component shell only
NEVER  manual <form> + useState — always CrudFormDialog + FormConfig
NEVER  var() or hex colors in className — Tailwind semantic classes only
NEVER  Route Handler for simple CRUD — Server Action or Server Component fetch
ALWAYS actions column inline in XxxTablePage, never in columns file
ALWAYS close dialog only in onSuccess callback of mutation
ALWAYS field.name must match backend DTO field name exactly
ALWAYS searchAction in autocompleteConfig must be a Server Action
ALWAYS user-facing strings in Spanish
ALWAYS pnpm (not npm/yarn)
ALWAYS $transaction for atomic asset code generation (race-condition safe)
```

---

## Architecture Decision Tree

```
New module?     → DDD: domain/ application/ infrastructure/ presentation/
New list page?  → page.tsx (Server) + XxxTablePage (Client) + hook + actions
New form?       → FormConfig in presentation/forms/ → CrudFormDialog
Need API search → type: "autocomplete" + Server Action
Need DB query?  → Server Component fetch OR Server Action
New entity?    → single Asset table — Category.fieldConfig drives field visibility
Auth guard?    → middleware.ts + hasPermission(role, action, resource)
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
  domain/         ← entities, repository interfaces
  application/    ← use-cases, DTOs
  infrastructure/ ← Prisma repos, mappers
```

---

## Domain Rules (concept-level — implementation lives in code)

- **Asset code**: atomic via `$transaction` on `Category.sequence`. Format: `NVH-{prefix}-{seq:5}`.
- **Depreciation**: dynamic, computed from `purchasePriceBase`, `salvageValue`, `usefulLifeYears`. Only `DepreciationSnapshot` rows are persisted (annual cuts).
- **Asset fields**: `Category.fieldConfig` (`required` | `optional` | `hidden`) drives Yup validation, form rendering, and column visibility per category.
- **RBAC**: `SUPER_ADMIN > ADMIN > MANAGER > TECHNICIAN > VIEWER`. New users default to `VIEWER`. Source of truth: `permissions.ts`.
- **Currency**: assets stored in COP via `purchasePriceBase`. USD inputs convert on write.

---

## Known Issues

- **Prisma 7**: NO `url` in `schema.prisma` datasource — only in `prisma.config.ts`
- **pnpm build scripts**: `.npmrc` must have `approve-builds=@prisma/engines,prisma,@prisma/client`
- **NextAuth v5 beta**: import from `next-auth` not `next-auth/next`; config export changed
- **QR scanner**: `html5-qrcode` requires `"use client"` + dynamic import (no SSR)
- **Excel import**: `xlsx` server-side only (Route Handler or Server Action)

---

## Project Commands

```bash
pnpm dev                                # dev server
pnpm build                              # production build
pnpm lint                               # ESLint
npx prisma migrate dev --name <name>    # new migration
npx prisma db seed                      # seed with CSV data
npx prisma studio                      # DB GUI
```
