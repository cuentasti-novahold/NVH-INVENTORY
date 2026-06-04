# Design: Acta de Asignación de Equipos (Employee Assignment PDF)

## Technical Approach

Clone the Asset History PDF stack (component + action + download trigger) into the
employees module. Read-only, additive, no schema changes. The row action mounts a
client-only download component which calls a new Server Action, builds a blob via
`pdf().toBlob()`, and triggers an anchor click. All strings in Spanish.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Generation site | Client-side `pdf().toBlob()` (mount-effect trigger) | Server-side render + stream | Mirrors existing `AssetHistoryDownload`; keeps `@react-pdf/renderer` off the server bundle; pattern already proven |
| Data fetch | New `getEmployeeAssignmentsAction` in `employees/actions.ts` | Reuse list action | Needs full asset+category+deliveredBy include not present in `EmployeeRow` |
| Permission | `employees.read` guard (VIEWER+) | `assignments.read` | Acta is an employee artifact; matches user decision |
| Empty assets | Button hidden when `assignmentsCount === 0` | Always show, empty-state PDF | User decision: hide button. PDF empty-state kept as defensive fallback |
| Status filter | `status: 'ACTIVE'` only | Include history | Acta is a point-in-time accountability record |

## Data Flow

    EmployeesTablePage (row action, canRead + count>0)
        └─ setDownloadId(row.id) ──→ <EmployeeActaDownload employeeId onDone>
              └─ getEmployeeAssignmentsAction(employeeId)  [Server Action, auth guard]
                    └─ prisma.employee.findUnique + assignment.findMany(ACTIVE)
              └─ pdf(<EmployeeAssignmentPDF data/>).toBlob() → anchor click → onDone()

## Interfaces / Contracts

```typescript
// employees/actions.ts — return type
export interface EmployeeAssignmentReportData {
  employee: {
    fullName: string; email: string; position: string | null;
    phone: string | null; departmentName: string | null;
    locationName: string | null; cityName: string | null;
  };
  assets: Array<{
    assetCode: string; categoryName: string;
    brand: string | null; model: string | null;
    serialNumber: string | null; generalStatus: string;
    assignedAt: string;            // ISO
    deliveredByName: string | null;
  }>;
  generatedAt: string;             // ISO
}

export async function getEmployeeAssignmentsAction(
  employeeId: string,
): Promise<ActionResult<EmployeeAssignmentReportData>>;
```

**Action body**: `auth()` + `hasPermission(role,'employees','read')` else `err('FORBIDDEN',...)`.
`prisma.employee.findUnique({ where:{id}, include:{ department:{select:{name}}, city:{select:{name}}, location:{select:{name}} } })` → `err('NOT_FOUND',...)` if null.
`prisma.assignment.findMany({ where:{ employeeId, status:'ACTIVE' }, orderBy:{assignedAt:'asc'}, include:{ asset:{ include:{ category:{select:{name}} } }, deliveredBy:{select:{name:true}} } })`.
Map: `deliveredByName = a.deliveredBy?.name ?? null`; dates `.toISOString()`. Return `ok(data)`.

## PDF Component — `EmployeeAssignmentPDF.tsx`

StyleSheet (clone palette `#111/#666/#f3f4f6/#e5e7eb`, Helvetica, A4):
`page{padding:40,fontFamily:'Helvetica',fontSize:10,color:'#111'}`,
`title{fontSize:16,fontWeight:'bold',marginBottom:4}`,
`subtitle{fontSize:10,color:'#666',marginBottom:20}`,
`section{marginBottom:16}`,
`sectionTitle{fontSize:11,fontWeight:'bold',marginBottom:6,borderBottom:'1px solid #ccc',paddingBottom:2}`,
`row{flexDirection:'row',marginBottom:3}`, `label{width:140,color:'#666'}`, `value{flex:1}`,
`tableHeader{flexDirection:'row',backgroundColor:'#f3f4f6',padding:'4 6',marginBottom:2}`,
`tableRow{flexDirection:'row',padding:'3 6',borderBottom:'0.5px solid #e5e7eb'}`,
columns: `cCode{width:'22%'} cDesc{width:'30%'} cSerial{width:'20%'} cStatus{width:'14%'} cDate{width:'14%'}`,
`empty{color:'#999',fontStyle:'italic'}`,
`declaration{marginTop:8,fontSize:9,color:'#444',lineHeight:1.4}`,
`signRow{flexDirection:'row',marginTop:48,justifyContent:'space-between'}`,
`signBox{width:'45%'}`, `signLine{borderTop:'1px solid #111',marginBottom:4}`,
`signLabel{fontSize:9,color:'#666'}`.

**Layout (single A4 Page):**
1. **Header** — `title`: "Acta de Asignación de Equipos"; `subtitle`: "{fullName} · Generado {generatedAt es-CO}".
2. **Datos del empleado** (`section`/`sectionTitle` + `row`s): Nombre, Cargo, Email, Teléfono, Departamento, Sede, Ciudad (`?? '—'`).
3. **Equipos asignados ({assets.length})**: `tableHeader` (Código, Marca/Modelo, Serial, Estado, Asignado). If empty → `empty` "Sin equipos asignados". Rows map: code, `[brand,model].filter(Boolean).join(' ')||'—'`, `serialNumber??'—'`, `generalStatus`, `assignedAt` (`toLocaleDateString('es-CO')`).
4. **Declaración** (`declaration`): paragraph stating the employee declares receiving the listed equipment in good condition, assumes custody/responsibility, and commits to return upon request or separation.
5. **Firmas** (`signRow`, two `signBox`): left — `signLine` + "{fullName}" + `signLabel` "Empleado — C.C. ____________ — Fecha ________"; right — `signLine` + `signLabel` "Entregado por — Fecha ________".

## Download Component — `EmployeeActaDownload.tsx`

`'use client'`. Props `{ employeeId: string; employeeName: string; onDone: () => void }`.
`useEffect(()=>{...},[])` (eslint-disable exhaustive-deps): call `getEmployeeAssignmentsAction(employeeId)`; on `!ok` → `toast.error('Error al generar el acta')` + `onDone()`; else `pdf(<EmployeeAssignmentPDF data={result.data}/>).toBlob()` → anchor `download = acta-asignacion-${slug(employeeName)}.pdf` → click → `revokeObjectURL` → `onDone()`. Returns `null`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/shared/ui/components/EmployeeAssignmentPDF.tsx` | Create | PDF document |
| `src/app/(dashboard)/employees/presentation/components/EmployeeActaDownload.tsx` | Create | Mount-triggered download |
| `src/app/(dashboard)/employees/actions.ts` | Modify | Add `getEmployeeAssignmentsAction` + `EmployeeAssignmentReportData` |
| `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx` | Modify | New state + FileText button + conditional mount |

## EmployeesTablePage Changes

- Add `FileText` to the `lucide-react` import.
- Add state: `const [downloadId, setDownloadId] = useState<string | null>(null)`.
- In the actions cell, render a `FileText` `Button` (icon/ghost/h-8 w-8) ONLY when
  `row.original.assignmentsCount > 0`, `onClick={() => setDownloadId(row.original.id)}`.
  This button is OUTSIDE the `canWrite` gate (VIEWER+ can read) — restructure cell so
  the FileText button shows for all roles, while Pencil/PowerOff/Trash2 stay under `canWrite`.
  Add `downloadId` to the `useMemo` deps.
- Mount conditionally near dialogs: `{downloadId && <EmployeeActaDownload employeeId={downloadId} employeeName={initialRows.find(r=>r.id===downloadId)?.fullName ?? ''} onDone={() => setDownloadId(null)} />}`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `getEmployeeAssignmentsAction` guard + mapping | Mock prisma/auth; assert FORBIDDEN, NOT_FOUND, ACTIVE-only, deliveredByName mapping |
| Unit | PDF empty-state | Render `EmployeeAssignmentPDF` with `assets:[]`; assert no throw |
| E2E (manual) | Row button → download | Click acta on employee with/without assets |

## Migration / Rollout

No migration required. Pure additive. Rollback = delete 2 new files + revert 2 edits.

## Open Questions

- [ ] Declaration legal wording — placeholder text used; confirm with admin/legal before release.
- [ ] Employee national ID (C.C.) not in schema → left as a blank signature line.
