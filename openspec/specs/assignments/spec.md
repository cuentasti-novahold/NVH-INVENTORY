# Assignments Specification

## Purpose

Manage the lifecycle of asset assignments to employees. An assignment tracks which employee holds a given asset, when it was delivered, and who delivered it. The system MUST guarantee that at most one ACTIVE assignment exists per asset at any time, and MUST enforce role-based access so that only authorised roles can create, return, transfer, or delete assignments.

## Requirements

### Requirement: REQ-01 List Assignments

The system MUST expose a paginated list of assignments at `/assignments`. Results SHALL be filterable by `status` (ACTIVE | RETURNED | TRANSFERRED) and free-text `q`. Each row MUST display: asset code, employee name, assignedAt, status, and deliveredBy.

#### Scenario: filtered list returns matching rows

- GIVEN the user holds VIEWER role or higher
- WHEN they request `/assignments?status=ACTIVE`
- THEN the response MUST contain only ACTIVE assignments, paginated

#### Scenario: no results — empty state

- GIVEN no assignments match the applied filters
- WHEN the page renders
- THEN an empty-state message SHALL be displayed and the table MUST NOT error

---

### Requirement: REQ-02 Create Assignment

An authorised user MUST be able to create an assignment by selecting an asset (autocomplete) and an employee (autocomplete). `deliveredById` SHALL be set automatically from `session.user.id`. `assignedAt` defaults to `now()` but MAY be overridden.

#### Scenario: new assignment created

- GIVEN the asset has no ACTIVE assignment and user is ADMIN or MANAGER
- WHEN they submit the create form with valid assetId and employeeId
- THEN a new Assignment record with status=ACTIVE MUST be persisted and the list refreshes

#### Scenario: asset already has active assignment

- GIVEN asset NVH-PC-00001 already has an ACTIVE assignment
- WHEN any user submits a new assignment for the same asset
- THEN the system MUST reject with CONFLICT error and display message in Spanish

---

### Requirement: REQ-03 Return Assignment

An ADMIN or SUPER_ADMIN MUST be able to mark an ACTIVE assignment as RETURNED. `returnedAt` SHALL be set to `now()`. Transition: ACTIVE → RETURNED only.

#### Scenario: assignment returned

- GIVEN assignment has status=ACTIVE
- WHEN an ADMIN triggers Return action
- THEN status MUST change to RETURNED and `returnedAt` MUST be set to current timestamp

#### Scenario: return on non-ACTIVE assignment rejected

- GIVEN assignment has status=RETURNED
- WHEN any user attempts to return it again
- THEN the system MUST reject with CONFLICT error; no data SHALL be mutated

---

### Requirement: REQ-04 Transfer Assignment

An ADMIN or SUPER_ADMIN MUST be able to transfer an asset from one employee to another. The operation MUST be atomic: the current ACTIVE closes as TRANSFERRED and a new ACTIVE opens for the new employee within a single `$transaction`.

#### Scenario: atomic transfer

- GIVEN assignment is ACTIVE for employee A
- WHEN an ADMIN transfers to employee B
- THEN old assignment MUST be TRANSFERRED and a new ACTIVE assignment for employee B MUST exist — both in the same transaction

#### Scenario: transfer rolls back on failure

- GIVEN a DB error occurs mid-transaction
- THEN NEITHER record SHALL be persisted; the asset remains ACTIVE under employee A

---

### Requirement: REQ-05 Delete Assignment

An ADMIN or SUPER_ADMIN MAY hard-delete an assignment only when status is RETURNED or TRANSFERRED. Deleting ACTIVE assignments MUST be forbidden.

#### Scenario: delete RETURNED assignment

- GIVEN assignment has status=RETURNED
- WHEN an ADMIN triggers Delete
- THEN the record MUST be removed from the database

#### Scenario: delete ACTIVE assignment blocked

- GIVEN assignment has status=ACTIVE
- WHEN any user attempts to delete it
- THEN the system MUST return FORBIDDEN error; the record SHALL remain unchanged

---

### Requirement: REQ-06 RBAC Guards

All assignment actions MUST be gated by `hasPermission(role, action, resource)`.

| Role | Allowed |
|------|---------|
| SUPER_ADMIN / ADMIN | assignments:* |
| MANAGER | assignments:create |
| TECHNICIAN / VIEWER | none |

#### Scenario: MANAGER creates assignment

- GIVEN session role is MANAGER
- WHEN user submits valid create form
- THEN assignment MUST be created

#### Scenario: VIEWER blocked

- GIVEN session role is VIEWER
- WHEN user attempts to create assignment
- THEN system MUST return UNAUTHORIZED; no assignment SHALL be created
