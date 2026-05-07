# Design: migrate-employees-import

Technical contract for migrating `/employees` from Excel-import v1 (legacy `importEmployeesAction` + `parseRow`-based dialog) to the v2 generic registry already validated by `categories`. The shared infrastructure in `src/shared/excel-import/` is in place — this design only locks down the EMPLOYEES-specific code: 3 new files under `employees/import/`, registry registration, and the cleanup of v1 artifacts.

---

## 1. `EmployeeImportRow` v2 type

The row shape AFTER `rowTransformer` runs (post-validation, FK names not yet resolved to ids). All required fields are non-null; optionals are `T | null`.

```typescript
export interface EmployeeImportRow {
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  departmentName: string | null;
  cityName: string | null;
  locationName: string | null;
  isActive: boolean;
}
```

Verified against `prisma.Employee`:
- `fullName String` → required
- `email String @unique` → required, lowercased in transformer
- `phone String?` → nullable
- `position String?` → nullable
- `departmentId String?` (resolved via `departmentName`) → nullable
- `cityId String?` (resolved via `cityName`) → nullable
- `locationId String?` (resolved via `locationName`) → nullable
- `isActive Boolean @default(true)` → defaults to true when blank

`isActive` lives as `boolean` in the row type (not `boolean | null`); transformer coerces empty/null to `true` to match the DB default.

---

## 2. `config.client.ts` — exact contents

Path: `src/app/(dashboard)/employees/import/config.client.ts`

```typescript
// Client-safe slice — NO Prisma imports, NO server-only code.
// Safe to import from Client Components.

import type { ColumnDef } from '@/shared/excel-import/types';

export const employeesImportColumns: readonly ColumnDef[] = [
  {
    header: 'Nombre completo*',
    key: 'fullName',
    type: 'string',
    required: true,
    maxLength: 120,
    width: 30,
    example: 'Ana García',
  },
  {
    header: 'Correo*',
    key: 'email',
    type: 'email',
    required: true,
    maxLength: 160,
    width: 30,
    example: 'ana@empresa.com',
  },
  {
    header: 'Teléfono',
    key: 'phone',
    type: 'string',
    required: false,
    maxLength: 40,
    width: 18,
    example: '+57 300 123 4567',
  },
  {
    header: 'Cargo',
    key: 'position',
    type: 'string',
    required: false,
    maxLength: 120,
    width: 22,
    example: 'Analista',
  },
  {
    header: 'Departamento',
    key: 'departmentName',
    type: 'string',
    required: false,
    maxLength: 120,
    width: 22,
    example: 'Tecnología',
  },
  {
    header: 'Ciudad',
    key: 'cityName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 20,
    example: 'Bogotá',
  },
  {
    header: 'Sede',
    key: 'locationName',
    type: 'string',
    required: false,
    maxLength: 100,
    width: 20,
    example: 'Oficina Principal',
  },
  {
    header: 'Activo',
    key: 'isActive',
    type: 'boolean',
    required: false,
    width: 12,
    example: 'SI',
  },
] as const;

export const employeesImportDisplayName = 'Empleados';
export const employeesImportModuleKey = 'employees';
```

---

## 3. `config.ts` — exact structure

Path: `src/app/(dashboard)/employees/import/config.ts`

```typescript
// Server-only — imports Prisma. Do NOT import this file from Client Components.

import type { ExcelImportConfig } from '@/shared/excel-import/types';
import { prisma } from '@/lib/prisma';
import {
  employeesImportColumns,
  employeesImportDisplayName,
  employeesImportModuleKey,
} from './config.client';
import { bulkCreateEmployees } from './bulk-create';

export interface EmployeeImportRow {
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  departmentName: string | null;
  cityName: string | null;
  locationName: string | null;
  isActive: boolean;
}

export const employeesImportConfig: ExcelImportConfig<EmployeeImportRow> = {
  moduleKey: employeesImportModuleKey,
  displayName: employeesImportDisplayName,
  entity: 'Employee',
  sheetName: 'Empleados',
  maxRows: 5000,
  columns: [...employeesImportColumns],

  masterValidations: [
    {
      key: 'departmentName',
      lookup: async (values) => {
        const rows = await prisma.department.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Departamento no existe',
    },
    {
      key: 'cityName',
      lookup: async (values) => {
        const rows = await prisma.city.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Ciudad no existe',
    },
    {
      key: 'locationName',
      lookup: async (values) => {
        const rows = await prisma.location.findMany({
          where: { name: { in: values } },
          select: { name: true },
        });
        return new Set(rows.map((r) => r.name));
      },
      errorMessage: 'Sede no existe',
    },
  ],

  rowTransformer: (flat): EmployeeImportRow => {
    const trimOrNull = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    const parseBool = (v: unknown): boolean => {
      if (v == null || v === '') return true; // default-active to match DB default
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      return !(s === 'no' || s === 'false' || s === '0' || s === 'inactivo');
    };

    return {
      fullName: String(flat.fullName).trim(),
      email: String(flat.email).trim().toLowerCase(),
      phone: trimOrNull(flat.phone),
      position: trimOrNull(flat.position),
      departmentName: trimOrNull(flat.departmentName),
      cityName: trimOrNull(flat.cityName),
      locationName: trimOrNull(flat.locationName),
      isActive: parseBool(flat.isActive),
    };
  },

  handler: bulkCreateEmployees,
};
```

Notes:
- `entity: 'Employee'` matches the Prisma model name (PascalCase singular) — `writeImportLog` stores this verbatim in `ImportLog.entity`.
- `sheetName: 'Empleados'` — Spanish, user-facing.
- `maxRows: 5000` — matches categories.
- The 3 master validations run BEFORE `rowTransformer` is invoked on a per-row basis? No — per the v2 contract, `rowTransformer` produces typed rows; master validations operate on the transformed values via `key`. They run in the order declared (department → city → location), which matches logical dependency.

---

## 4. `bulk-create.ts` — exact pseudocode

Path: `src/app/(dashboard)/employees/import/bulk-create.ts`

```typescript
// Server-only — imports Prisma. Do NOT import from Client Components.

import { prisma } from '@/lib/prisma';
import { writeImportLog } from '@/shared/excel-import/log';
import type { ImportConfirmResult } from '@/shared/excel-import/types';
import type { EmployeeImportRow } from './config';

// Mirror of isP2002 helper from employees/actions.ts (lines 36-41)
// Inline replication — do NOT extract to shared in this PR.
function isP2002(e: unknown, target: string): boolean {
  const prismaErr = e as {
    code?: string;
    meta?: { target?: string | string[] };
    message?: string;
  };
  if (prismaErr?.code !== 'P2002') return false;
  const t = prismaErr.meta?.target;
  if (typeof t === 'string') return t.includes(target);
  if (Array.isArray(t)) return t.includes(target);
  // Fallback: MariaDB adapter may omit meta.target — check message
  return (
    typeof prismaErr.message === 'string' && prismaErr.message.includes(target)
  );
}

export async function bulkCreateEmployees(
  rows: EmployeeImportRow[],
  userId: string,
  fileName: string,
): Promise<ImportConfirmResult> {
  const result: ImportConfirmResult = {
    totalReceived: rows.length,
    created: 0,
    failed: 0,
    errors: [],
  };

  // ── Pre-resolve all 3 FK names → ids in parallel ──────────────────────────
  const deptNames = [
    ...new Set(rows.map((r) => r.departmentName).filter((v): v is string => v != null)),
  ];
  const cityNames = [
    ...new Set(rows.map((r) => r.cityName).filter((v): v is string => v != null)),
  ];
  const locNames = [
    ...new Set(rows.map((r) => r.locationName).filter((v): v is string => v != null)),
  ];

  const [depts, cities, locs] = await Promise.all([
    deptNames.length > 0
      ? prisma.department.findMany({
          where: { name: { in: deptNames } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    cityNames.length > 0
      ? prisma.city.findMany({
          where: { name: { in: cityNames } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    locNames.length > 0
      ? prisma.location.findMany({
          where: { name: { in: locNames } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const deptMap = new Map(depts.map((d) => [d.name, d.id]));
  const cityMap = new Map(cities.map((c) => [c.name, c.id]));
  const locMap = new Map(locs.map((l) => [l.name, l.id]));

  // ── Row-isolated create loop ──────────────────────────────────────────────
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    // Defense in depth: master-validator already checked these exist.
    // If a name fails to resolve here, surface as a row error rather than crash.
    const departmentId = row.departmentName != null ? deptMap.get(row.departmentName) : undefined;
    const cityId = row.cityName != null ? cityMap.get(row.cityName) : undefined;
    const locationId = row.locationName != null ? locMap.get(row.locationName) : undefined;

    if (row.departmentName != null && departmentId == null) {
      result.failed++;
      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: 'Departamento no existe',
      });
      continue;
    }
    if (row.cityName != null && cityId == null) {
      result.failed++;
      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: 'Ciudad no existe',
      });
      continue;
    }
    if (row.locationName != null && locationId == null) {
      result.failed++;
      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: 'Sede no existe',
      });
      continue;
    }

    try {
      await prisma.employee.create({
        data: {
          fullName: row.fullName,
          email: row.email,
          phone: row.phone ?? null,
          position: row.position ?? null,
          isActive: row.isActive,
          ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
          ...(cityId ? { city: { connect: { id: cityId } } } : {}),
          ...(locationId ? { location: { connect: { id: locationId } } } : {}),
        },
      });
      result.created++;
    } catch (e: unknown) {
      result.failed++;

      let errorMsg: string;
      if (isP2002(e, 'email')) {
        errorMsg = 'Correo duplicado';
      } else if (isP2002(e, '')) {
        // Generic P2002 fallback (no specific target detected)
        errorMsg = 'Duplicado';
      } else {
        errorMsg = e instanceof Error ? e.message : 'Error al crear empleado';
      }

      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: errorMsg,
      });
    }
  }

  await writeImportLog('Employee', result, userId, fileName);

  return result;
}
```

P2002 detection logic:
- First check: `isP2002(e, 'email')` → `'Correo duplicado'` (matches v1 wording)
- Fallback: `isP2002(e, '')` returns true for ANY P2002 (since `''.includes('')` and string `target.includes('')` are always true). Use a different gate — instead, check `(e as {code?: string}).code === 'P2002'` directly for the generic fallback. Apply phase: replace `isP2002(e, '')` with a direct code-equality check to avoid the `''` quirk.

Correction for the apply phase — the second branch should be:

```typescript
} else if ((e as { code?: string })?.code === 'P2002') {
  errorMsg = 'Duplicado';
}
```

---

## 5. EmployeesTablePage migration spec

### 5.1 `EmployeesTablePage.tsx`

Path: `src/app/(dashboard)/employees/presentation/components/EmployeesTablePage.tsx`

**REMOVE imports** (lines 13, 17, 18 of the type import):
```typescript
import { ExcelImportDialog } from '@/shared/ui/components/ExcelImportDialog'; // v1 path — DELETE
import { importEmployeesAction } from '../../actions';                         // DELETE
// In the type import, drop `EmployeeImportRow`:
import type { EmployeeRow, CreateEmployeeDTO, UpdateEmployeeDTO, EmployeeImportRow } from '../dto/employee.dto';
//                                                                  ^^^^^^^^^^^^^^^^ remove only this
```

**ADD imports**:
```typescript
import { ExcelImportDialog } from '@/shared/excel-import/components/ExcelImportDialog'; // v2 path
```

`useRouter` is already imported (line 4). No additional import needed.

**REPLACE the dialog mount** at lines 224-246 with:
```tsx
<ExcelImportDialog
  open={dialogs.importOpen}
  onOpenChange={(open) => setDialogs((s) => ({ ...s, importOpen: open }))}
  moduleKey="employees"
  title="Importar empleados"
  onSuccess={() => router.refresh()}
/>
```

**No changes** to:
- `dialogs` state shape (`importOpen` already exists)
- `canWrite` gate or the toolbar button
- Any other dialog (create/edit) or table props

### 5.2 `employees/actions.ts`

**DELETE** `importEmployeesAction` (lines 381-521 — full function).

**DELETE** `toBool` helper (lines 374-379 — exclusive to `importEmployeesAction`).

**DELETE** the import-section banner comment (line 372: `// ─── Import ────────────────`) since the section becomes empty.

**Imports to inspect for safe removal** at the top of `actions.ts`:

| Line | Import | Used elsewhere in file? | Action |
|------|--------|------------------------|--------|
| 3 | `import * as yup from 'yup'` | Yes — `yupToFieldErrors` (line 47) is used by create/update | KEEP |
| 4 | `import { revalidatePath } from 'next/cache'` | Verify — likely used by create/update/delete actions | KEEP unless rg shows zero remaining callers |
| 7 | `import type { Prisma } from '@/generated/prisma/client'` | Verify — only `importEmployeesAction` uses `Prisma.InputJsonValue` for `errors` cast | REMOVE if no other caller |
| 10 | `import type { ExcelImportResult, ExcelRowError } from '@/shared/ui/types/excel-import.types'` | Only used by `importEmployeesAction` | REMOVE |
| 21 | `EmployeeImportRow` from local DTO type import | Only used by `importEmployeesAction` | REMOVE from the type import list |

Apply phase MUST run `rg "Prisma\\." src/app/\\(dashboard\\)/employees/actions.ts` and `rg "revalidatePath" src/app/\\(dashboard\\)/employees/actions.ts` after the deletion to verify each candidate. Do not remove imports without grep confirmation.

### 5.3 `employees/presentation/dto/employee.dto.ts`

**DELETE** the `EmployeeImportRow` interface (lines 32-41 — including the blank line above).

**KEEP** unchanged: `EmployeeRow`, `CreateEmployeeDTO`, `UpdateEmployeeDTO`.

---

## 6. Registry registration

Path: `src/shared/excel-import/registry.ts`

Add 2 lines: one import (after the categories import on line 2), one register call (after line 28).

```typescript
import { employeesImportConfig } from '@/app/(dashboard)/employees/import/config';
// ...
register(employeesImportConfig as ExcelImportConfig<unknown>);
```

Resulting bottom of file:
```typescript
// ─── Module registrations ──────────────────────────────────────────────────
register(categoriesImportConfig as ExcelImportConfig<unknown>);
register(employeesImportConfig as ExcelImportConfig<unknown>);
```

---

## 7. Test boundary (informational — Strict TDD disabled)

Unit-testable in isolation (with mocked Prisma):
- `bulk-create.ts` → pre-resolve correctness (Promise.all of 3 findMany), Map building, P2002 → `'Correo duplicado'` mapping, generic P2002 fallback, defense-in-depth FK resolution failures.
- `rowTransformer` (pure function, no Prisma) → trim, lowercase email, null-coalesce, `parseBool` matrix (SI/NO/TRUE/FALSE/1/0/blank/inactivo).

Integration-testable through the v2 `ExcelImportDialog` flow (already validated by the categories module — same code path).

No tests will be written this PR (`strict_tdd: disabled`).

---

## 8. Open design questions

None. Design is locked. Proceed to `sdd-tasks`.

---

## 9. Architectural decisions (ADR-style)

### ADR-1: Mirror categories pattern, do not generalize
- **Decision**: Implement employees by copying the categories shape (3 files in `import/`, `register()` line, swap mount). No new abstraction.
- **Rationale**: v2 is one consumer in (categories). Generalizing on N=2 risks premature abstraction. Wait for N≥3 (assets) before extracting helpers.
- **Rejected**: Extracting `isP2002` to shared — premature, and the helper is 12 lines.

### ADR-2: Department error-if-not-found (breaking vs v1)
- **Decision**: `departmentName` is a `masterValidation` (errors when missing). v1's `upsert` behavior is removed.
- **Rationale**: Silent department auto-create is a data-quality risk (typos create phantom departments). v2's pattern is consistent across all FK validations.
- **Trade-off**: Users must pre-create departments via UI before importing. Documented in PR description.
- **Rejected**: Keep upsert inside `bulkCreateEmployees` — preserves v1 but breaks consistency with the v2 contract.

### ADR-3: City/Location exact match (breaking vs v1 `contains`)
- **Decision**: Both use exact `in` lookups via masterValidations.
- **Rationale**: `contains` is non-deterministic (multiple matches possible) and obscures errors. Exact match + downloadable error file is clearer feedback.
- **Rejected**: `contains` lookup — adds query complexity, ambiguous semantics.

### ADR-4: Single-PR delete of v1 code
- **Decision**: Delete `importEmployeesAction`, `toBool`, and `EmployeeImportRow` in the same PR as the v2 add.
- **Rationale**: After the dialog swap, zero callers remain. Keeping dead code creates confusion about which path is active. Net delta ~+25 LOC stays within 400-line budget.
- **Rejected**: Two-PR split (PR1 add, PR2 delete) — coexistence period adds review noise without benefit.

### ADR-5: `revalidatePath` → `router.refresh()`
- **Decision**: v2 uses client-side `router.refresh()` in `onSuccess` instead of server-side `revalidatePath('/employees')`.
- **Rationale**: Identical user-facing effect, validated by categories. The v2 dialog is decoupled from per-module revalidation logic.
- **Trade-off**: Slightly different mechanism (client navigation refresh vs. server cache invalidation) — both trigger a fresh server fetch.
