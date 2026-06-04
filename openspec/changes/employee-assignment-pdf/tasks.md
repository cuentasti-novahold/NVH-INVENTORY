# Tasks: Employee Assignment PDF — Acta de Asignación de Equipos

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–310 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 4 file changes + tests | PR 1 | Single coherent unit, read-only additive, no migration |

---

## Phase 1: Foundation — Server Action + Type

- [x] T-01 Add `EmployeeAssignmentReportData` interface to `src/app/(dashboard)/employees/actions.ts`
  - Fields per spec REQ-04: `employee` block (fullName, email, position, phone, departmentName, locationName, cityName) + `assets[]` (assetCode, categoryName, brand, model, serialNumber, generalStatus, assignedAt ISO, deliveredByName) + `generatedAt` ISO string
  - Satisfies: REQ-04 data contract
  - AC: TypeScript compiles; interface exported and importable from PDF component
  - Estimated: 20 LOC

- [x] T-02 Add `getEmployeeAssignmentsAction(employeeId: string)` Server Action to `src/app/(dashboard)/employees/actions.ts`
  - Auth guard: `auth()` + `hasPermission(role, 'employees', 'read')` → `err('FORBIDDEN')` on fail
  - Prisma: `employee.findUnique({ where:{id:employeeId}, include:{department,city,location} })` → `err('NOT_FOUND')` if null
  - Prisma: `assignment.findMany({ where:{employeeId,status:'ACTIVE'}, orderBy:{assignedAt:'asc'}, include:{asset:{include:{category:{select:{name}}}}, deliveredBy:{select:{name:true}}} })`
  - Map `deliveredByName = a.deliveredBy?.name ?? null`, dates to `.toISOString()`, `generatedAt = new Date().toISOString()`
  - Return `ok(data)` typed as `ActionResult<EmployeeAssignmentReportData>`
  - Satisfies: REQ-02, REQ-03 (server empty-list pass-through), REQ-04
  - AC: action returns FORBIDDEN for unauthenticated; NOT_FOUND for missing employee; data includes only ACTIVE assignments ordered by assignedAt asc
  - Estimated: 40 LOC

---

## Phase 2: Core — PDF Component

- [x] T-03 Create `src/shared/ui/components/EmployeeAssignmentPDF.tsx`
  - Clone style palette from `AssetHistoryPDF.tsx`; add 5 new column-width styles: `cCode 22%`, `cDesc 30%`, `cSerial 20%`, `cStatus 14%`, `cDate 14%`; add `declaration`, `signRow`, `signBox`, `signLine`, `signLabel` styles
  - Props: `{ data: EmployeeAssignmentReportData }`
  - Section 1 — Header: title `"Acta de Asignación de Equipos"`, subtitle `"{fullName} · Generado {date es-CO}"`
  - Section 2 — Datos del empleado: rows for Nombre, Cargo, Email, Teléfono, Departamento, Sede, Ciudad (null → `"—"`)
  - Section 3 — Equipos asignados (n) table: columns Código / Marca-Modelo / Serial / Estado / Asignado; empty-state `"Sin equipos asignados"`; map `generalStatus` to Spanish label per REQ-08 (`GOOD→Bueno`, `REGULAR→Regular`, `BAD→Malo`, `DAMAGED→Dañado`, `RETIRED→Dado de baja`); dates formatted `es-CO`; `serialNumber ?? '—'`; brand+model `.filter(Boolean).join(' ') || '—'`
  - Section 4 — Declaración paragraph (Spanish legal copy, placeholder)
  - Section 5 — Firmas: two `signBox` side-by-side, left for employee, right for responsible
  - No `'use server'`/`'use client'` directive — pure render component
  - Satisfies: REQ-05, REQ-06, REQ-07, REQ-08
  - AC: renders without throws when `assets:[]`; `serialNumber: null` renders as `"—"` not `"null"`; all 7 column headers appear in order; both signature blocks render
  - Estimated: 120 LOC

---

## Phase 3: Integration — Download Component + Table Wire-up

- [x] T-04 Create `src/app/(dashboard)/employees/presentation/components/EmployeeActaDownload.tsx`
  - `'use client'`; Props: `{ employeeId: string; employeeName: string; onDone: () => void }`
  - `useEffect([], eslint-disable)`: call `getEmployeeAssignmentsAction(employeeId)`
  - On `!result.ok` or `result.data.assets.length === 0`: `toast.error('Error al generar el acta')` + `onDone()`
  - On success: `pdf(<EmployeeAssignmentPDF data={result.data}/>).toBlob()` → create anchor → `download=acta-asignacion-${employeeId.slice(0,8)}.pdf` → click → `revokeObjectURL` → `onDone()`
  - Returns `null`
  - Satisfies: REQ-03 (client guard + toast), REQ-09 (filename), REQ-10 (error toast)
  - AC: filename matches pattern `acta-asignacion-{first8chars}.pdf`; no download triggered on empty assets; error toast in Spanish on action failure
  - Estimated: 35 LOC

- [x] T-05 Modify `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx`
  - Add `FileText` to lucide import alongside existing icons
  - Add state: `const [downloadId, setDownloadId] = useState<string | null>(null)`
  - In `columns` `useMemo`, add `FileText` Button (icon/ghost/h-8 w-8) OUTSIDE the `canWrite` gate (VIEWER+ can read), only when `row.original.assignmentsCount > 0`; `onClick={() => setDownloadId(row.original.id)}`
  - Add `downloadId` to `useMemo` deps array
  - Mount near dialogs: `{downloadId && <EmployeeActaDownload employeeId={downloadId} employeeName={initialRows.find(r => r.id === downloadId)?.fullName ?? ''} onDone={() => setDownloadId(null)} />}`
  - Satisfies: REQ-01 (button visibility + disabled-when-no-assignments logic via conditional render)
  - AC: button appears for VIEWER rows with `assignmentsCount > 0`; button absent when `assignmentsCount === 0`; `downloadId` reset to null after `onDone`
  - Estimated: 25 LOC delta

---

## Phase 4: Tests (Strict TDD — RED → GREEN)

> STRICT TDD MODE IS ACTIVE. All server-side logic must have tests. Test runner: `pnpm vitest`.

- [x] T-06 Add `getEmployeeAssignmentReportAction` describe block to `src/app/(dashboard)/employees/__tests__/actions.test.ts`
  - **RED subtask**: Write 5 failing tests first (no implementation yet):
    1. Returns FORBIDDEN when unauthenticated (`mockAuth.mockResolvedValue(null)`)
    2. Returns FORBIDDEN for TECHNICIAN role
    3. Returns VIEWER success: returns `employee` + `assets` array with ACTIVE assignments only
    4. Returns NOT_FOUND for unknown `employeeId`
    5. Returns empty `assets:[]` when no ACTIVE assignments exist (action still returns ok)
  - **GREEN subtask**: T-02 implementation makes all 5 tests pass
  - Add `assignment` mock to the top-level `vi.mock('@/lib/prisma', ...)` block with `findMany: vi.fn()`
  - Satisfies: REQ-02 (auth check), REQ-03 (empty list guard), REQ-04 (data contract)
  - AC: `pnpm vitest` passes with 0 failures; tests cover all 5 scenarios; no new test file created (extends existing)
  - Estimated: 60 LOC

- [x] T-07 Verify `EmployeeAssignmentPDF` renders without throw on edge cases
  - Add test in a new `src/shared/ui/components/__tests__/EmployeeAssignmentPDF.test.tsx` (or collocated)
  - Test: render with `assets:[]` does not throw — use `pdf(...).toBlob()` or snapshot the element tree
  - Test: `serialNumber: null` renders as `"—"` not `"null"`
  - Test: `generalStatus: 'GOOD'` renders as `"Bueno"` (verifies REQ-08 mapping)
  - Satisfies: REQ-05, REQ-06, REQ-08
  - AC: `pnpm vitest` passes; no snapshot bloat; tests are isolated (no real PDF binary assertion needed)
  - Estimated: 40 LOC

---

## Dependency Order

```
T-01 (type) → T-02 (action) → T-06 RED (tests fail) → T-02 GREEN (tests pass)
                                                       ↓
T-03 (PDF component) → T-07 (PDF tests)
T-03 + T-02 → T-04 (download component)
T-04 → T-05 (table wire-up)
```

Minimum sequential chain: T-01 → T-02 → T-03 → T-04 → T-05
Tests: T-06 is RED before T-02 implementation; T-07 is written after T-03

## Implementation Notes

- `EmployeeAssignmentPDF.tsx` has no `'use client'` — it is imported only inside the download component's `useEffect`, never at module top-level in an RSC
- `slug(employeeName)` in design is replaced by `employeeId.slice(0,8)` per REQ-09 (UUID prefix, not name-slug)
- `assignmentsCount` field already exists on `EmployeeRow` (used in `deleteEmployeeAction` guard) — no DTO change needed
- The `assignment` prisma mock key may need to be added to the existing `vi.mock` block in `actions.test.ts`
