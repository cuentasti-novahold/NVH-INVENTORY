# Skill Registry — nvh-inventory
_Generated: 2026-04-18_

## Compact Rules

### nextjs-16/main-page
**Trigger**: Creating or modifying a list/table page, columns definition, or XxxTablePage component.
**Source**: `skills/nextjs-16/main-page/SKILL.md`
- `page.tsx` is Server Component (no "use client", no logic)
- `XxxTablePage.tsx` is Client Component ("use client") — contains full CRUD, state, dialogs
- `columns-xxx.tsx` is Client Component — display only, no business logic
- Actions column defined INLINE in `XxxTablePage`, never in the columns file
- Use `MainDataTable` from `@/components/tables/MainTable` for paginated TanStack table
- Use `PageHeader` from `@/components/dashboard/PageHeader` for filter/import/create bar
- Use `TableSkeleton` from `@/components/tables/TableSkeleton` for loading state

### nextjs-16/form-builder
**Trigger**: Building or modifying forms, adding fields, autocomplete inputs, or CrudFormDialog.
**Source**: `skills/nextjs-16/form-builder/SKILL.md`
- ALWAYS use `CrudFormDialog` + `FormConfig` — never manual `<form>` + useState
- `FormConfig` lives in `presentation/forms/{module}-form.config.ts` — plain TS, no directive
- `field.name` MUST match backend DTO field name exactly
- `searchAction` in autocompleteConfig MUST be a Server Action
- Close dialog ONLY in `onSuccess` callback of mutation

### tailwind-4
**Trigger**: Styling with Tailwind (className, variants, cn()), dynamic styling, CSS variables.
**Source**: `skills/tailwind-4/SKILL.md`
- NEVER use `var()` in className — use Tailwind semantic classes
- NEVER use hex colors in className — use Tailwind color classes
- Use `cn()` from `tailwind-merge` for conditional classes

### interface-design
**Trigger**: UI/dashboard/panel work — dashboards, admin panels, data tables, interactive tools.
**Source**: system skill (inline)
- NOT for landing pages or marketing sites

### next-best-practices
**Trigger**: Next.js patterns, RSC boundaries, data patterns, async APIs, metadata, error handling.
**Source**: system skill (inline)
- NEVER "use client" in page.tsx — Server Component shell only
- Server Components fetch data; Client Components handle interaction
- Use Server Actions for mutations (never Route Handlers for simple CRUD)

---

## User Skills (trigger table)

| Skill | Trigger Context |
|-------|----------------|
| `branch-pr` | Creating a PR, preparing changes for review |
| `issue-creation` | Creating a GitHub issue, reporting a bug, requesting a feature |
| `judgment-day` | Adversarial review — "judgment day", "dual review", "juzgar" |
| `skill-creator` | Creating a new agent skill |
| `skill-registry` | Updating the skill registry |
| `find-skills` | Looking for installable skills |
| `sdd-explore` | Exploring ideas before committing to a change |
| `sdd-propose` | Creating a change proposal |
| `sdd-spec` | Writing specs for a change |
| `sdd-design` | Writing technical design |
| `sdd-tasks` | Breaking a change into tasks |
| `sdd-apply` | Implementing tasks |
| `sdd-verify` | Validating implementation against specs |
| `sdd-archive` | Archiving a completed change |

---

## Convention Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Agent rules → `@AGENTS.md` (ERP rules, critical constraints, architecture patterns) |
| `PRD.md` | Full product spec — source of truth for requirements |
| `SCHEMA.md` | Database schema documentation |
