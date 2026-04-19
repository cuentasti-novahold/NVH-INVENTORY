# Tasks: Assignments Module

**STRICT TDD MODE IS ACTIVE.** Test runner: `pnpm test:unit`.

## TDD Ordering Rule
For every non-trivial implementation file:
1. Write the test → run `pnpm test:unit` → confirm RED
2. Write implementation → run `pnpm test:unit` → confirm GREEN

---

## Phase 1: Foundation (Types + Mapper)

- [x] T-00 Baseline: run `pnpm test:unit`, record count (expect 181 tests, 0 failures)
- [x] T-01 Create `assignment.dto.ts` with AssignmentRow, CreateAssignmentDTO, ReturnAssignmentDTO, TransferAssignmentDTO
- [x] T-02 Create `assignment.mapper.ts` with assignmentInclude and toAssignmentRow
- [x] T-03 [RED] Write mapper unit test in `__tests__/actions.test.ts` asserting toAssignmentRow shape
- [x] T-04 Create `assignment.schema.ts` with createAssignmentSchema, returnAssignmentSchema, transferAssignmentSchema (Yup)

---

## Phase 2: Server Actions (TDD)

- [x] T-05 [RED] Write failing tests for listAssignmentsAction (auth guard, returns rows)
- [x] T-06 [GREEN] Implement listAssignmentsAction
- [x] T-07 [RED] Write failing tests for createAssignmentAction (happy path, CONFLICT guard, UNAUTHORIZED, FORBIDDEN)
- [x] T-08 [GREEN] Implement createAssignmentAction with $transaction + uniqueness guard
- [x] T-09 [RED] Write failing tests for returnAssignmentAction (happy path, NOT_FOUND, already returned)
- [x] T-10 [GREEN] Implement returnAssignmentAction with CAS where clause `{ id, status: 'ACTIVE' }`
- [x] T-11 [RED] Write failing tests for transferAssignmentAction (atomic, rollback simulation)
- [x] T-12 [GREEN] Implement transferAssignmentAction with $transaction (update ACTIVE→TRANSFERRED + create new ACTIVE)
- [x] T-13 [RED] Write failing tests for deleteAssignmentAction (happy path, ACTIVE blocked)
- [x] T-14 [GREEN] Implement deleteAssignmentAction (reject if status === ACTIVE)
- [x] T-15 [RED] Write failing tests for searchAssignmentsAction
- [x] T-16 [GREEN] Implement searchAssignmentsAction
- [x] T-17 Confirm all tests GREEN: run `pnpm test:unit`

---

## Phase 3: Presentation Layer

- [x] T-18 Create `assignment-form.config.ts` — buildCreateFormConfig, buildReturnFormConfig, buildTransferFormConfig; autocomplete: assetId→searchAssetsAction, employeeId/newEmployeeId→searchEmployeesAction
- [x] T-19 Create `columns-assignments.tsx` — assetCode, employeeName, status badge, assignedAt, returnedAt, deliveredByName
- [x] T-20 Create `use-assignments.ts` — useAssignments(): { pending, create, return_, transfer, remove }
- [x] T-21 Create `AssignmentsTablePage.tsx` — status filter tabs, three CrudFormDialogs (create/return/transfer), inline actions column (Devolver: ACTIVE+canAdmin; Transferir: ACTIVE+canAdmin; Eliminar: non-ACTIVE+canAdmin)
- [x] T-22 Create `page.tsx` — Server Component, auth check, listAssignmentsAction, renders AssignmentsTablePage

---

## Phase 4: Manual Verification

- [ ] T-23 /assignments — table renders with paginated rows
- [ ] T-24 Create assignment — asset+employee autocomplete works, status=ACTIVE
- [ ] T-25 Return assignment — status→RETURNED, Devolver button disappears
- [ ] T-26 Transfer assignment — old=TRANSFERRED, new ACTIVE row appears
- [ ] T-27 Delete RETURNED assignment — row disappears
- [ ] T-28 Create with already-ACTIVE asset — CONFLICT toast appears
- [ ] T-29 Confirm all tests still GREEN: run `pnpm test:unit`
