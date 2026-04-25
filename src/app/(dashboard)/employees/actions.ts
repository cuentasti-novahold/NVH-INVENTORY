'use server';

import * as yup from 'yup';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { ExcelImportResult, ExcelRowError } from '@/shared/ui/types/excel-import.types';
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from './presentation/schemas/employee.schema';
import { toEmployeeRow, employeeInclude } from './presentation/mappers/employee.mapper';
import type {
  EmployeeRow,
  CreateEmployeeDTO,
  UpdateEmployeeDTO,
  EmployeeImportRow,
} from './presentation/dto/employee.dto';

type Role = Parameters<typeof hasPermission>[0];

async function requireWrite() {
  const session = await auth();
  if (!session?.user) return { error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Role, 'employees', 'create'))
    return { error: err('FORBIDDEN', 'Sin permiso') };
  return { session };
}

function isP2002(e: unknown, target: string): boolean {
  const pe = e as { code?: string; meta?: { target?: string | string[] } };
  if (pe?.code !== 'P2002') return false;
  const t = pe.meta?.target;
  return typeof t === 'string' ? t.includes(target) : Array.isArray(t) && t.includes(target);
}

function isP2025(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2025';
}

function yupToFieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const ve = e as {
    inner?: Array<{ path?: string; message: string }>;
    path?: string;
    message?: string;
  };
  if (ve.inner?.length) {
    for (const i of ve.inner) if (i.path) out[i.path] = i.message;
  } else if (ve.path && ve.message) {
    out[ve.path] = ve.message;
  }
  return out;
}

// ─── List ──────────────────────────────────────────────────────────────────────

import type { PageInfo } from '@/shared/types/pagination';

export interface ListEmployeesParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  isActive?: 'active' | 'inactive' | 'all';
  q?: string;
}

export interface ListEmployeesResult {
  rows: EmployeeRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listEmployeesAction(
  params: ListEmployeesParams = {},
): Promise<ActionResult<ListEmployeesResult>> {
  const session = await auth();
  if (
    !session?.user ||
    !hasPermission(session.user.role as Role, 'employees', 'read')
  )
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const isActive = params.isActive ?? 'active';
  const q = params.q?.trim() ?? '';

  const filterWhere: Record<string, unknown> = {};
  if (isActive === 'active') filterWhere.isActive = true;
  else if (isActive === 'inactive') filterWhere.isActive = false;
  if (q.length > 0) {
    filterWhere.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { position: { contains: q } },
    ];
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.employee.findUnique({
      where: { id: afterCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { lt: afterCursor } },
        ],
      };
    }
  } else if (beforeCursor) {
    const pivot = await prisma.employee.findUnique({
      where: { id: beforeCursor },
      select: { createdAt: true },
    });
    if (pivot) {
      cursorWhere = {
        OR: [
          { createdAt: { gt: pivot.createdAt } },
          { createdAt: pivot.createdAt, id: { gt: beforeCursor } },
        ],
      };
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
    }
  }

  const hasFilter = Object.keys(filterWhere).length > 0;
  const hasCursor = Object.keys(cursorWhere).length > 0;
  const finalWhere = hasFilter && hasCursor
    ? { AND: [cursorWhere, filterWhere] }
    : hasCursor
      ? cursorWhere
      : filterWhere;

  const [rows, rowCount] = await prisma.$transaction([
    prisma.employee.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: employeeInclude,
    }),
    prisma.employee.count({ where: filterWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  return ok({
    rows: data.map(toEmployeeRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

// ─── Search employees (autocomplete for assignment module) ─────────────────────

export async function searchEmployeesAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const q = query.trim();
  const rows = await prisma.employee.findMany({
    where: {
      isActive: true,
      OR: [
        { fullName: { contains: q } },
        { email: { contains: q } },
      ],
    },
    select: { id: true, fullName: true, email: true },
    take: 20,
    orderBy: { fullName: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: `${r.fullName} — ${r.email}` })));
}

// ─── Search departments (autocomplete) ────────────────────────────────────────

export async function searchDepartmentsAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const rows = await prisma.department.findMany({
    where: { name: { contains: query.trim() } },
    select: { id: true, name: true },
    take: 20,
    orderBy: { name: 'asc' },
  });
  return ok(rows.map((r) => ({ code: r.id, value: r.name })));
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createEmployeeAction(
  input: CreateEmployeeDTO,
): Promise<ActionResult<EmployeeRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: CreateEmployeeDTO;
  try {
    dto = (await employeeCreateSchema.validate(input, {
      abortEarly: false,
    })) as CreateEmployeeDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const e = await prisma.$transaction(async (tx) => {
      let deptId = dto.departmentId ?? null;
      if (!deptId && dto.departmentName && dto.departmentName.trim().length > 0) {
        const d = await tx.department.upsert({
          where: { name: dto.departmentName.trim() },
          update: {},
          create: { name: dto.departmentName.trim() },
          select: { id: true },
        });
        deptId = d.id;
      }
      return tx.employee.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone ?? null,
          position: dto.position ?? null,
          isActive: dto.isActive ?? true,
          ...(deptId ? { department: { connect: { id: deptId } } } : {}),
          ...(dto.cityId ? { city: { connect: { id: dto.cityId } } } : {}),
          ...(dto.locationId ? { location: { connect: { id: dto.locationId } } } : {}),
        },
        include: employeeInclude,
      });
    });
    revalidatePath('/employees');
    return ok(toEmployeeRow(e));
  } catch (e) {
    if (isP2002(e, 'email'))
      return err('CONFLICT', 'Correo duplicado', {
        email: 'Ya existe un empleado con este correo',
      });
    return err('UNKNOWN', 'Error al crear empleado');
  }
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updateEmployeeAction(
  id: string,
  input: UpdateEmployeeDTO,
): Promise<ActionResult<EmployeeRow>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  let dto: UpdateEmployeeDTO;
  try {
    dto = (await employeeUpdateSchema.validate(input, {
      abortEarly: false,
    })) as UpdateEmployeeDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const e = await prisma.$transaction(async (tx) => {
      let deptAction: Record<string, unknown> | undefined;
      if (dto.departmentId !== undefined || dto.departmentName !== undefined) {
        if (dto.departmentId) {
          deptAction = { department: { connect: { id: dto.departmentId } } };
        } else if (dto.departmentName && dto.departmentName.trim().length > 0) {
          const d = await tx.department.upsert({
            where: { name: dto.departmentName.trim() },
            update: {},
            create: { name: dto.departmentName.trim() },
            select: { id: true },
          });
          deptAction = { department: { connect: { id: d.id } } };
        } else {
          deptAction = { department: { disconnect: true } };
        }
      }

      const data: Record<string, unknown> = {};
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.email !== undefined) data.email = dto.email;
      if (dto.phone !== undefined) data.phone = dto.phone ?? null;
      if (dto.position !== undefined) data.position = dto.position ?? null;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (dto.cityId !== undefined)
        data.city = dto.cityId ? { connect: { id: dto.cityId } } : { disconnect: true };
      if (dto.locationId !== undefined)
        data.location = dto.locationId
          ? { connect: { id: dto.locationId } }
          : { disconnect: true };
      if (deptAction) Object.assign(data, deptAction);

      return tx.employee.update({ where: { id }, data, include: employeeInclude });
    });
    revalidatePath('/employees');
    return ok(toEmployeeRow(e));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Empleado no encontrado');
    if (isP2002(e, 'email'))
      return err('CONFLICT', 'Correo duplicado', {
        email: 'Ya existe un empleado con este correo',
      });
    return err('UNKNOWN', 'Error al actualizar empleado');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteEmployeeAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  const row = await prisma.employee.findUnique({
    where: { id },
    select: { _count: { select: { assignments: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Empleado no encontrado');
  if (row._count.assignments > 0)
    return err(
      'HAS_CHILDREN',
      `No se puede eliminar: tiene ${row._count.assignments} asignaciones. Usá "Desactivar" en su lugar.`,
    );

  await prisma.employee.delete({ where: { id } });
  revalidatePath('/employees');
  return ok(undefined);
}

// ─── Deactivate ────────────────────────────────────────────────────────────────

export async function deactivateEmployeeAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;

  try {
    await prisma.employee.update({ where: { id }, data: { isActive: false } });
    revalidatePath('/employees');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Empleado no encontrado');
    return err('UNKNOWN', 'Error al desactivar empleado');
  }
}

// ─── Import ────────────────────────────────────────────────────────────────────

function toBool(v: string | boolean | null): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return true;
  const norm = v.trim().toLowerCase();
  return !(norm === 'no' || norm === 'false' || norm === '0' || norm === 'inactivo');
}

export async function importEmployeesAction(
  rows: EmployeeImportRow[],
): Promise<ActionResult<ExcelImportResult>> {
  const g = await requireWrite();
  if ('error' in g) return g.error;
  const userId = g.session.user.id as string;

  const errors: ExcelRowError[] = [];
  let inserted = 0;
  let skipped = 0;

  const existingEmails = new Set(
    (await prisma.employee.findMany({ select: { email: true } })).map((e) =>
      e.email.toLowerCase(),
    ),
  );
  const seenEmailsInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + 2;

    if (!r.fullName || !r.fullName.trim()) {
      errors.push({ row: rowNum, field: 'fullName', message: 'Nombre requerido' });
      skipped++;
      continue;
    }
    if (!r.email || !r.email.trim()) {
      errors.push({ row: rowNum, field: 'email', message: 'Correo requerido' });
      skipped++;
      continue;
    }

    const emailNorm = r.email.trim().toLowerCase();

    try {
      await yup.string().email().required().validate(emailNorm);
    } catch {
      errors.push({ row: rowNum, field: 'email', message: 'Correo inválido' });
      skipped++;
      continue;
    }

    if (seenEmailsInBatch.has(emailNorm)) {
      errors.push({ row: rowNum, field: 'email', message: 'Correo duplicado en el archivo' });
      skipped++;
      continue;
    }
    if (existingEmails.has(emailNorm)) {
      errors.push({ row: rowNum, field: 'email', message: 'Correo ya existe en la base' });
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        let deptId: string | null = null;
        if (r.department && r.department.trim()) {
          const d = await tx.department.upsert({
            where: { name: r.department.trim() },
            update: {},
            create: { name: r.department.trim() },
            select: { id: true },
          });
          deptId = d.id;
        }

        let cityId: string | null = null;
        if (r.city && r.city.trim()) {
          const c = await tx.city.findFirst({
            where: { name: { contains: r.city.trim() } },
            select: { id: true },
          });
          if (!c) throw new Error(`CITY_NOT_FOUND:${r.city.trim()}`);
          cityId = c.id;
        }

        let locationId: string | null = null;
        if (r.location && r.location.trim()) {
          const l = await tx.location.findFirst({
            where: { name: { contains: r.location.trim() } },
            select: { id: true },
          });
          if (!l) throw new Error(`LOCATION_NOT_FOUND:${r.location.trim()}`);
          locationId = l.id;
        }

        await tx.employee.create({
          data: {
            fullName: r.fullName!.trim(),
            email: emailNorm,
            phone: r.phone?.trim() || null,
            position: r.position?.trim() || null,
            isActive: toBool(r.isActive),
            ...(deptId ? { department: { connect: { id: deptId } } } : {}),
            ...(cityId ? { city: { connect: { id: cityId } } } : {}),
            ...(locationId ? { location: { connect: { id: locationId } } } : {}),
          },
        });
      });

      inserted++;
      existingEmails.add(emailNorm);
      seenEmailsInBatch.add(emailNorm);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.startsWith('CITY_NOT_FOUND:'))
        errors.push({
          row: rowNum,
          field: 'city',
          message: `Ciudad no encontrada: ${msg.split(':')[1]}`,
        });
      else if (msg.startsWith('LOCATION_NOT_FOUND:'))
        errors.push({
          row: rowNum,
          field: 'location',
          message: `Sede no encontrada: ${msg.split(':')[1]}`,
        });
      else if (isP2002(e, 'email'))
        errors.push({ row: rowNum, field: 'email', message: 'Correo duplicado' });
      else errors.push({ row: rowNum, message: 'Error al insertar' });
      skipped++;
    }
  }

  await prisma.importLog.create({
    data: {
      userId,
      entity: 'Employee',
      fileName: 'employees-import.xlsx',
      totalRows: rows.length,
      successRows: inserted,
      errorRows: skipped,
      errors: errors.length > 0 ? errors : undefined,
      status: inserted === 0 && skipped > 0 ? 'FAILED' : 'COMPLETED',
    },
  });

  revalidatePath('/employees');
  return ok({ inserted, skipped, errors });
}
