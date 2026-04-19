# Design: Assignments Module

## Technical Approach

Replicate the `employees` DDD presentation stack (DTO → Mapper → Yup Schema → Server Actions → Hook → `XxxTablePage` → `page.tsx`) for the existing `Assignment` Prisma model. All mutations flow through `CrudFormDialog` with autocomplete fields powered by the already-available `searchAssetsAction` / `searchEmployeesAction`. Lifecycle transitions (create, return, transfer, delete) each get a dedicated Server Action; the transfer is wrapped in a `prisma.$transaction` to guarantee atomicity. No schema migration, no sidebar change, no permission change — all those assets already exist.

## Architecture Decisions

### Decision: Form strategy (CrudFormDialog vs custom)

**Choice**: `CrudFormDialog` + `FormConfig` for all three forms (create, return, transfer).
**Alternatives considered**: Custom `<form>` with `useState`; single mega-form with a status dropdown.
**Rationale**: Project rule forbids manual `form+useState`. Three narrow `FormConfig`s stay declarative, each with a minimal Yup schema, and keep RBAC gating per-action clean.

### Decision: Transfer atomicity

**Choice**: Single `prisma.$transaction(async tx => { tx.assignment.update({ where: { id, status: 'ACTIVE' }, data: { status: 'TRANSFERRED', returnedAt: new Date() } }); ... tx.assignment.create(...new ACTIVE...) })`
**Rationale**: Two sequential Server Actions leak a window where the asset has no active assignment. The `where: { id, status: 'ACTIVE' }` clause is Prisma CAS — throws P2025 if already transitioned, aborting cleanly.

### Decision: requireWrite discriminated union

**Choice**: `{ ok: true; userId: string } | { ok: false; error: ActionResult<never> }`
**Rationale**: Avoids the `ActionResult<never> | undefined` narrowing bug from the `error in g` pattern. Callers use `if (!g.ok) return g.error;` — TypeScript narrows `g.userId` cleanly.

### Decision: Uniqueness guard on ACTIVE per asset

**Choice**: Pre-check inside the create transaction — `tx.assignment.findFirst({ where: { assetId, status: 'ACTIVE' } })` → if found, `err('CONFLICT', ...)`.
**Rationale**: MySQL does not support partial unique indexes cleanly via Prisma generators. REPEATABLE READ isolation makes the check safe for realistic concurrency.

## Data Flow

```
page.tsx (Server)
  └─ listAssignmentsAction(searchParams) ──→ AssignmentsTablePage (Client)
                                               ├─ CrudFormDialog (create)   ──→ createAssignmentAction
                                               ├─ CrudFormDialog (return)   ──→ returnAssignmentAction
                                               ├─ CrudFormDialog (transfer) ──→ transferAssignmentAction
                                               └─ inline delete button      ──→ deleteAssignmentAction
                                               (all via useAssignments hook + toast + revalidatePath)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/(dashboard)/assignments/page.tsx` | New | Server shell: reads session + searchParams, calls `listAssignmentsAction` |
| `src/app/(dashboard)/assignments/actions.ts` | New | 6 Server Actions + `requireWrite` + `isP2002/P2025` helpers |
| `src/app/(dashboard)/assignments/__tests__/actions.test.ts` | New | Unit tests (Strict TDD) |
| `src/app/(dashboard)/assignments/presentation/dto/assignment.dto.ts` | New | `AssignmentRow`, `CreateAssignmentDTO`, `ReturnAssignmentDTO`, `TransferAssignmentDTO` |
| `src/app/(dashboard)/assignments/presentation/mappers/assignment.mapper.ts` | New | `assignmentInclude`, `toAssignmentRow` |
| `src/app/(dashboard)/assignments/presentation/schemas/assignment.schema.ts` | New | Yup schemas per DTO |
| `src/app/(dashboard)/assignments/presentation/forms/assignment-form.config.ts` | New | `buildCreateFormConfig`, `buildReturnFormConfig`, `buildTransferFormConfig` |
| `src/app/(dashboard)/assignments/presentation/components/AssignmentsTablePage.tsx` | New | Client CRUD shell with three dialogs + inline actions column |
| `src/app/(dashboard)/assignments/presentation/components/columns-assignments.tsx` | New | Display-only columns |
| `src/app/(dashboard)/assignments/presentation/hooks/use-assignments.ts` | New | `create/return/transfer/remove` wrappers with `useTransition` + toast |

## Key Types

```typescript
// AssignmentRow
export interface AssignmentRow {
  id: string;
  assetId: string;
  assetCode: string;
  assetLabel: string;           // `${brand ?? ''} ${model ?? ''}`.trim()
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  status: 'ACTIVE' | 'RETURNED' | 'TRANSFERRED';
  assignedAt: string;           // ISO
  returnedAt: string | null;
  deliveredById: string | null;
  deliveredByName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssignmentDTO { assetId: string; employeeId: string; notes?: string | null; }
export interface ReturnAssignmentDTO { notes?: string | null; }
export interface TransferAssignmentDTO { newEmployeeId: string; notes?: string | null; }
```

## Form Config

Three builders in `assignment-form.config.ts`, consumed by `CrudFormDialog`:

- **Create**: `assetId` (autocomplete → `searchAssetsAction`, `returnMode: 'code'`) + `employeeId` (autocomplete → `searchEmployeesAction`) + `notes` (textarea)
- **Return**: `notes` (textarea only) — id passed as prop outside the form
- **Transfer**: `newEmployeeId` (autocomplete → `searchEmployeesAction`) + `notes`

Field `name` values match DTO keys exactly (project standard).

## Server Actions

```typescript
listAssignmentsAction(params: ListAssignmentsParams): Promise<ActionResult<ListAssignmentsResult>>
searchAssignmentsAction(q: string): Promise<ActionResult<{ code: string; value: string }[]>>
createAssignmentAction(dto: CreateAssignmentDTO): Promise<ActionResult<AssignmentRow>>
returnAssignmentAction(id: string, dto: ReturnAssignmentDTO): Promise<ActionResult<AssignmentRow>>
transferAssignmentAction(id: string, dto: TransferAssignmentDTO): Promise<ActionResult<AssignmentRow>>
deleteAssignmentAction(id: string): Promise<ActionResult<null>>
```

All mutations: `requireWrite(verb)` → Yup validate → `$transaction` → `revalidatePath('/assignments')`.
Delete: rejected if `status === 'ACTIVE'` with `err('CONFLICT', 'No se puede eliminar una asignación activa')`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Yup schema validation | Vitest unit — required fields, invalid status |
| Unit | `toAssignmentRow` mapper | Vitest with fake Prisma include shape |
| Unit | All 6 Server Actions | Vitest with mocked prisma + auth |
| Unit | RBAC: VIEWER/MANAGER blocked | Assert UNAUTHORIZED/FORBIDDEN per action |

## Migration / Rollout

No migration required — schema already exists. Rollback = delete `src/app/(dashboard)/assignments/` folder.
