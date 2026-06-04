# Proposal: Acta de Asignación de Equipos (Employee Assignment PDF)

## Intent

Employees hold company assets without a signed, auditable record tying each person
to their equipment. There is no legal-accountability artifact. This change adds a
downloadable PDF ("Acta de Asignación de Equipos") per employee listing every ACTIVE
asset under their responsibility, plus a signature section, so the company has a
printable, sign-able accountability document.

## Scope

### In Scope
- Server action returning an employee's profile + ACTIVE assignments (asset + category + deliveredBy).
- PDF component (`@react-pdf/renderer`) rendering header, employee data, equipment table, signature block.
- Download trigger (`'use client'`, mount → action → `pdf().toBlob()` → anchor click → `onDone`).
- New inline action button in the `EmployeesTablePage` row actions (gated like existing buttons).
- All user-facing strings in Spanish.

### Out of Scope
- Schema changes (all data exists in current Prisma models).
- RETURNED / TRANSFERRED history, multi-employee batch export, email delivery.
- Digital/e-signature integration (PDF leaves a manual signature line).
- Persisting the generated acta to storage.

## Capabilities

### New Capabilities
- `employee-assignment-pdf`: on-demand generation of a per-employee PDF acta listing
  ACTIVE assigned assets with a signature section for legal accountability.

### Modified Capabilities
- None. The `assignments` capability's lifecycle requirements are unchanged; this is a
  read-only consumer of existing assignment data.

## Approach

Reuse the proven Asset History PDF pattern end-to-end:
- PDF: clone `AssetHistoryPDF.tsx` structure — Helvetica, `StyleSheet.create`, palette
  (`#111`/`#666`/`#f3f4f6`/`#e5e7eb`). New section: signature block (name, ID, date, line).
- Action: mirror `getAssetHistoryAction` in `employees/actions.ts`, reusing `hasPermission()`
  / read-guard patterns. Query: `assignment.findMany({ where:{ employeeId, status:'ACTIVE' },
  include:{ asset:{ include:{ category } }, deliveredBy } })`.
- Download: clone `AssetHistoryDownload.tsx` (rendered on demand from the row action).
- UI: add a FileText/Download button to the inline actions column in `EmployeesTablePage`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/shared/ui/components/EmployeeAssignmentPDF.tsx` | New | PDF document component |
| `src/app/(dashboard)/employees/.../EmployeeActaDownload.tsx` | New | Download trigger |
| `src/app/(dashboard)/employees/actions.ts` | Modified | New `getEmployeeAssignmentsAction` |
| `.../components/EmployeesTablePage.tsx` | Modified | New inline action button + state |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Employee with zero active assets | Med | Render empty-state row in table; still emit acta |
| Heavy PDF lib bloats client bundle | Low | Dynamic import; pattern already isolated client-side |
| Permission gap for VIEWER export | Low | Reuse existing read-guard; gate button via permissions |

## Rollback Plan

Pure additive change. Revert by removing the two new files and the action button +
`getEmployeeAssignmentsAction` from the two modified files. No migrations, no data impact.

## Dependencies

- `@react-pdf/renderer` v4.5.1 (already installed).

## Success Criteria

- [ ] Row action generates and downloads a per-employee PDF acta.
- [ ] Acta lists all ACTIVE assigned assets and includes a signature section.
- [ ] Empty-asset employees produce a valid acta with empty-state.
- [ ] All strings in Spanish; access gated by existing permissions.
