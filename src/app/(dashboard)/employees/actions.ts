'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from './presentation/schemas/employee.schema';
import { toEmployeeRow, employeeInclude } from './presentation/mappers/employee.mapper';
import type {
  EmployeeRow,
  CreateEmployeeDTO,
  UpdateEmployeeDTO,
} from './presentation/dto/employee.dto';

type Role = Parameters<typeof hasPermission>[0];
type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

async function requireWrite(): Promise<AuthCheck> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Role, 'employees', 'create'))
    return { ok: false, error: err('FORBIDDEN', 'Sin permiso') };
  return { ok: true, userId: session.user.id as string };
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
  if (!g.ok) return g.error;

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
  if (!g.ok) return g.error;

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
  if (!g.ok) return g.error;

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
  if (!g.ok) return g.error;

  try {
    await prisma.employee.update({ where: { id }, data: { isActive: false } });
    revalidatePath('/employees');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Empleado no encontrado');
    return err('UNKNOWN', 'Error al desactivar empleado');
  }
}

