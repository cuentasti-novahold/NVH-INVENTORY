# Proposal: Assignments Module

## Intent
Provide a dedicated UI to create, track, return, and transfer asset-to-employee assignments. Today the `Assignment` model exists but has no admin surface; operators cannot record deliveries or returns without direct DB access.

## Scope

### In Scope
- List page at `/assignments` with filters (status, employee, asset) and pagination
- Create assignment (asset + employee autocomplete, optional notes) — `status=ACTIVE`, `deliveredById` auto from session
- Return assignment (`status=RETURNED`, `returnedAt=now()`)
- Transfer assignment (close current as `TRANSFERRED`, open new `ACTIVE` for new employee) — atomic
- Delete non-ACTIVE assignments (ADMIN+)
- Business rule: asset can only hold one `ACTIVE` assignment at a time
- Row actions inline (view, return, transfer, delete) respecting RBAC

### Out of Scope
- AuditLog entries (deferred)
- Bulk Excel import of assignments
- QR-scan flow for return/transfer (future)
- Assignment history timeline per asset (separate module concern)
- Notifications/emails on assignment changes

## Capabilities

### New Capabilities
- `assignments`: CRUD over `Assignment` with lifecycle transitions (ACTIVE -> RETURNED | TRANSFERRED), uniqueness guard on active asset, and role-gated actions.

### Modified Capabilities
None

## Approach
Follow the established `employees` / `assets` DDD pattern:
- `src/modules/assignments/{domain,application,infrastructure}` with `IAssignmentRepository`, use cases (`CreateAssignment`, `ReturnAssignment`, `TransferAssignment`, `DeleteAssignment`, `ListAssignments`), `PrismaAssignmentRepository`, and mapper.
- `src/app/(dashboard)/assignments/` with `page.tsx` (Server), `AssignmentsTablePage` (Client), `columns-assignments.tsx`, `assignment-form.config.ts` using `CrudFormDialog` + autocomplete fields powered by existing `searchAssetsAction` / `searchEmployeesAction`.
- Server Actions for all mutations; uniqueness check + transition wrapped in `prisma.$transaction`.
- RBAC via `hasPermission` guards in each Server Action.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/assignments/` | New | Full DDD module |
| `src/app/(dashboard)/assignments/` | New | Route, table page, form config, hook |
| Sidebar nav | None | Link already present |
| `prisma/schema.prisma` | None | Model already exists |
| `src/lib/permissions.ts` | None | `assignments:*` already defined |

## Risks
| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Race on duplicate ACTIVE assignment | Medium | `$transaction` + pre-check on `{assetId, status: ACTIVE}` |
| Transfer partial failure | Low | Single `$transaction` closing old + opening new |
| MANAGER privilege creep | Low | Explicit `assignments:create` only; update/delete gated to ADMIN+ |

## Rollback Plan
Remove `src/app/(dashboard)/assignments/` route and `src/modules/assignments/` folder. No DB migration is introduced, so no data rollback required.

## Dependencies
- Existing `searchAssetsAction`, `searchEmployeesAction`
- `CrudFormDialog`, `MainDataTable`, `PageHeader`, `Show`
- `hasPermission` (RBAC), NextAuth session for `deliveredById`

## Success Criteria
- [ ] `/assignments` lists paginated records with filters
- [ ] Create flow generates ACTIVE assignment, auto-fills `deliveredById`
- [ ] Return flow sets `RETURNED` + `returnedAt`
- [ ] Transfer flow closes old and opens new atomically
- [ ] Duplicate ACTIVE on same asset is rejected
- [ ] MANAGER can create; only ADMIN+ can return/transfer/delete
- [ ] Delete blocked for ACTIVE assignments
- [ ] All UI strings in Spanish
