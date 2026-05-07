# Proposal: excel-import-system

**Project**: nvh-inventory · **Phase**: sdd-propose · **Mode**: interactive (hybrid store)
**Engram**: `sdd/excel-import-system/proposal` · **Depends on**: `sdd/excel-import-system/explore` (#187)

---

## 1. Intent

Build a generic, config-driven Excel import system (v2) at `src/shared/excel-import/` that replaces the limitations of the v1 dialog with a two-phase preview/confirm flow, server-side validation, master-data FK resolution, and downloadable error files. Land it as a foundation under the new `categories` module — a greenfield consumer with no existing import — so the v2 system proves itself end-to-end before older modules (assets, employees) migrate.

**Success criteria**:
- ADMIN+ user uploads `.xlsx` from `CategoriesTablePage`, sees a preview with row-level errors, confirms, and the system inserts valid rows while returning an error-annotated `.xlsx` for failed rows.
- `ImportLog` row written with `entity: "Category"`, accurate `successRows` / `errorRows`, and `errors` JSON populated.
- v1 dialog and its two consumers (employees, assets) remain untouched and functional.
- All three PRs pass `pnpm lint` and `pnpm build` independently.

---

## 2. Why now

- The skill `nextjs-16/excel-import/SKILL.md` v2.0 was just authored as the canonical contract — implementing it cements the convention before more modules accumulate copy-paste imports.
- v1 dialog is single-phase, has no preview, no error file, no server validation, no template download — every additional consumer worsens the technical debt.
- The new `categories` module has no import yet, giving us a low-risk surface to land the v2 infra without regressing production flows.
- `xlsx@0.18.5` is already installed, `ImportLog` already matches the v2 shape, `categories:create` permission already exists in `lib/permissions.ts`. The non-code prerequisites are all green.

---

## 3. Scope

### In scope

- New generic infra at `src/shared/excel-import/`: types, registry, parser, validator, master-validator, error-excel-builder, log helper, Server Actions, and the v2 dialog component.
- New per-module folder `src/app/(dashboard)/settings/categories/import/` with `config.ts` (column definitions + `parentName → parentId` master validation) and `bulk-create.ts` (handler).
- Wiring `CategoriesTablePage.tsx` to mount the v2 dialog with a toolbar import button.
- `parentName` resolution semantics: when `parentName` is provided but not found in DB, return a **row error** (Option A — explicit fail). Empty/missing `parentName` ⇒ root category (`parentId: null`).
- `maxRows` default of `5000` for the categories config (simple table, no FK fan-out).

### Out of scope

- Migrating `EmployeesTablePage` or `AssetsTablePage` from the v1 dialog to v2 — explicit follow-up change, one module at a time.
- Adding tests (project has `strict_tdd: disabled`).
- `fieldConfig` import support — documented limitation; ADMIN edits via the form post-import.
- Background-queue migration (Inngest / Trigger.dev) for files beyond Server Action limits — future change if any module exceeds ~1500 complex rows or 30s.
- Modifying or deleting the v1 dialog at `src/shared/ui/components/ExcelImportDialog.tsx` and its types.

---

## 4. Approach summary

The v2 system follows the skill's two-phase pattern:

1. **Preview phase** — `previewImportAction(moduleKey, base64File)`:
   parse with `xlsx` server-side → run column-type validator per row → run master validators (FK lookups by name) against accumulated values → return `ImportPreviewResult { totalRows, validRows, errors[] }`. No DB writes.

2. **Confirm phase** — `confirmImportAction(moduleKey, base64File, fileName)`:
   re-parse + re-validate (defense against mutated client state) → call the per-module `bulkCreate` handler → handler writes rows row-isolated, captures `P2002`/validation errors as `RowError[]`, calls `writeImportLog` → if errors exist, build error-annotated `.xlsx` via `XLSX.write()` and return base64. Result: `ImportConfirmResult { totalReceived, created, failed, errors[], errorFileBase64? }`.

The dialog component is config-driven: it receives a `moduleKey`, looks up the config from `registry.ts` (explicit imports), renders the column hints and error preview, and downloads the error file if returned. New modules add a `config.ts` + `bulk-create.ts` plus one line in `registry.ts` — no dialog changes, no Server Action changes.

**Coexistence (Path A)**: v1 stays at `@/shared/ui/components/ExcelImportDialog` (untouched, two consumers unchanged). v2 lives at `@/shared/excel-import/components/ExcelImportDialog` (new). Different paths, zero collision. Future per-module migration is a lift-and-shift.

---

## 5. Architecture sketch

```
src/shared/excel-import/
├── types.ts                       (~60) ColumnDef, ExcelImportConfig, MasterValidation,
│                                         RowError, ImportPreviewResult, ImportConfirmResult
├── registry.ts                    (~20) explicit imports → Map<moduleKey, ExcelImportConfig>
├── parser.ts                      (~40) base64 → workbook → rows[], 10MB guard
├── validator.ts                   (~80) per-row column-type validation → RowError[]
├── master-validator.ts            (~40) executes MasterValidation[] (e.g. parentName → parentId)
├── error-excel-builder.ts         (~35) appends "Errores" column, returns base64 via XLSX.write
├── log.ts                         (~20) writeImportLog(entity, fileName, totals, errors)
│                                         using `as unknown as Prisma.InputJsonValue`
├── actions.ts                     (~70) "use server" — previewImportAction, confirmImportAction;
│                                         calls requireWrite() / hasPermission(role, moduleKey, 'create')
└── components/
    └── ExcelImportDialog.tsx     (~180) "use client" — upload → preview → confirm → result/download

src/app/(dashboard)/settings/categories/import/
├── config.ts                      (~45) categoryImportConfig: 5 columns + parentName masterValidation
└── bulk-create.ts                 (~45) handler: row-isolated prisma.category.create loop +
                                         writeImportLog("Category", ...)

src/app/(dashboard)/settings/categories/presentation/components/
└── CategoriesTablePage.tsx        (+25) toolbar import button + ExcelImportDialog v2 mount
```

Flow:

```
[User] → ExcelImportDialog (client)
           │  upload .xlsx (base64)
           ▼
        previewImportAction (server)
           │  parser → validator → master-validator
           ▼
        ImportPreviewResult ─→ render preview + errors
           │  user clicks "Confirmar"
           ▼
        confirmImportAction (server)
           │  parser → validator → master-validator → bulkCreate handler
           │                                            │  prisma.category.create per row
           │                                            │  writeImportLog
           │                                            ▼
           │                                       errorFileBase64 (if errors)
           ▼
        ImportConfirmResult ─→ render result + download error file
```

---

## 6. Key decisions

| Topic | Decision | Rationale |
|---|---|---|
| Coexistence with v1 | **Path A** — v1 untouched, v2 fresh at new path | Zero regression risk; clean per-module migration |
| Registry style | **Explicit imports in `registry.ts`** | Predictable Next bundling; no side-effect magic |
| Excel parser | **`xlsx` synchronous (already installed)** | Zero new deps, proven via `buildXlsx()` in assets/actions.ts |
| Error file | **Server-side base64 via `XLSX.write()`** | Pattern already used in production; superior UX |
| `handler` location | **Separate `bulk-create.ts`, referenced in `config.ts`** | Testable in isolation, aligned with skill v2 |
| ImportLog write | **Inside handler via shared `writeImportLog` helper** | Handler owns `entity`; generic action stays clean |
| `maxRows` (categories) | **5000** | Simple table, no FK fan-out, ~2s for full file |
| `parentName` not found | **Row error (Option A)** | Explicit fail; user fixes in error file |
| `fieldConfig` in template | **Excluded** | Complex JSON; bad Excel UX; edited post-import via form |
| Permissions | **Reuse `hasPermission(role, moduleKey, 'create')`** | `categories:create` already exists for ADMIN+ |
| `Prisma.InputJsonValue` cast | **Standardize on `as unknown as Prisma.InputJsonValue`** | Cleaner than `JSON.parse(JSON.stringify(...))` |

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| v1 dialog and v2 dialog coexist long-term — drift between them | Documented Path A; SKILL is the contract; v1 declared frozen until per-module migration |
| `parentName` row error is stricter than v1 behavior | Acceptable — v1 has no parent FK semantics for categories; this is a new feature, not a regression |
| `fieldConfig` cannot be imported | Documented limitation; ADMIN edits via existing form; reasonable for v1 of the feature |
| Future module migration (assets) may exceed Server Action 30s | Documented future mitigation: lower `maxRows` for complex modules, or escalate to background queue |
| Re-parsing in `confirmImportAction` doubles work | Acceptable — defends against mutated client state; categories are small enough that 2× ~1s is fine |
| `P2002` on duplicate `prefix` or `name` within a single file | Handled by row-isolated try/catch in `bulkCreate`; reported as row error, not a hard stop |

---

## 8. PR delivery plan

`auto-chain` (3 chained PRs). Each PR is independently mergeable, each builds on the previous one.

| PR | Contents | Est LOC | Depends on |
|---|---|---|---|
| **PR1a — data layer** | `types.ts`, `registry.ts` (empty map initially), `log.ts`, `parser.ts`, `validator.ts`, `master-validator.ts`, `error-excel-builder.ts` | ~295 | — (foundation) |
| **PR1b — actions + dialog** | `actions.ts`, `components/ExcelImportDialog.tsx` | ~250 | PR1a |
| **PR2 — categories module** | `categories/import/config.ts`, `categories/import/bulk-create.ts`, `CategoriesTablePage.tsx` (+25), register config in `registry.ts` | ~140 | PR1b |

PR1a is pure logic, no consumers, no Server Actions — safe to land. PR1b adds the entry points (no consumer yet, so no UX visible). PR2 wires the first user. Total ~685 LOC across three PRs, all under the 400-line budget per PR.

---

## 9. Acceptance criteria

- [ ] ADMIN uploads a `.xlsx` with 5+ category rows from `CategoriesTablePage` → preview shows totals and any column-type errors.
- [ ] Row with `parentName` matching an existing category resolves to `parentId` correctly; row with non-existent `parentName` shows row error in preview.
- [ ] Confirm → valid rows appear in `prisma.category` table; `assetCode` / `prefix` / `name` uniqueness violations reported per-row, not as a hard stop.
- [ ] `ImportLog` row written: `entity: "Category"`, accurate `totalRows` / `successRows` / `errorRows`, `status: COMPLETED` (or `FAILED` if zero successful), `errors` JSON populated.
- [ ] If errors > 0, dialog offers download of error-annotated `.xlsx` with an "Errores" column appended.
- [ ] VIEWER attempting to open the import dialog → `requireWrite()` rejects with proper error.
- [ ] All user-facing strings in Spanish (button: "Importar Excel", dialog title: "Importar categorías", etc.).
- [ ] v1 dialog still renders identically in `EmployeesTablePage` and `AssetsTablePage`; existing import flows unchanged.
- [ ] PR1a, PR1b, PR2 each pass `pnpm lint` and `pnpm build` independently.

---

## 10. Open questions

None — all settled in the explore phase and the interactive review.
