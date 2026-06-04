// Server-only — imports Prisma. Do NOT import from Client Components.

import { prisma } from '@/lib/prisma';
import { writeImportLog } from '@/shared/excel-import/log';
import type { ImportConfirmResult } from '@/shared/excel-import/types';
import type { EmployeeImportRow } from './config';

// Mirror of isP2002 helper from employees/actions.ts
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
      } else if ((e as { code?: string })?.code === 'P2002') {
        // Generic P2002 fallback — direct equality check, NOT isP2002(e, '') which matches everything
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
