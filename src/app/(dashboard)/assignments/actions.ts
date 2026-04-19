'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import {
  createAssignmentSchema,
  returnAssignmentSchema,
  transferAssignmentSchema,
} from './presentation/schemas/assignment.schema';
import {
  toAssignmentRow,
  toEmployeeAssignmentRow,
  assignmentInclude,
} from './presentation/mappers/assignment.mapper';
import type { PrismaEmployeeWithAssignmentStats } from './presentation/mappers/assignment.mapper';
import type {
  AssignmentRow,
  EmployeeAssignmentRow,
  CreateAssignmentDTO,
  ReturnAssignmentDTO,
  TransferAssignmentDTO,
} from './presentation/dto/assignment.dto';

type Role = Parameters<typeof hasPermission>[0];
type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

async function requireWrite(verb: 'create' | 'update' | 'delete' = 'create'): Promise<AuthCheck> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: err('UNAUTHORIZED', 'No autenticado') };
  const action = verb === 'create' ? 'create' : verb === 'delete' ? 'delete' : 'update';
  if (!hasPermission(session.user.role as Role, 'assignments', action))
    return { ok: false, error: err('FORBIDDEN', 'Sin permiso') };
  return { ok: true, userId: session.user.id as string };
}

function isP2025(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2025';
}

function yupToFieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const ve = e as { inner?: Array<{ path?: string; message: string }>; path?: string; message?: string };
  if (ve.inner?.length) {
    for (const i of ve.inner) if (i.path) out[i.path] = i.message;
  } else if (ve.path && ve.message) {
    out[ve.path] = ve.message;
  }
  return out;
}

// ─── List ──────────────────────────────────────────────────────────────────

export interface ListAssignmentsParams {
  page?: number;
  pageSize?: number;
  status?: 'ACTIVE' | 'RETURNED' | 'TRANSFERRED' | 'all';
  q?: string;
}

export interface ListAssignmentsResult {
  rows: AssignmentRow[];
  rowCount: number;
  pageCount: number;
}

export async function listAssignmentsAction(
  params: ListAssignmentsParams = {},
): Promise<ActionResult<ListAssignmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const status = params.status ?? 'ACTIVE';
  const q = params.q?.trim() ?? '';

  const where: Record<string, unknown> = {};
  if (status !== 'all') where.status = status;
  if (q.length > 0) {
    where.OR = [
      { asset: { assetCode: { contains: q } } },
      { employee: { fullName: { contains: q } } },
    ];
  }

  const [rows, rowCount] = await prisma.$transaction([
    prisma.assignment.findMany({
      where,
      orderBy: { assignedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: assignmentInclude,
    }),
    prisma.assignment.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({ rows: (rows as any[]).map(toAssignmentRow), rowCount, pageCount });
}

// ─── List by Employee ──────────────────────────────────────────────────────

export interface ListEmployeeAssignmentsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListEmployeeAssignmentsResult {
  rows: EmployeeAssignmentRow[];
  rowCount: number;
  pageCount: number;
}

export async function listEmployeeAssignmentsAction(
  params: ListEmployeeAssignmentsParams = {},
): Promise<ActionResult<ListEmployeeAssignmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const q = params.q?.trim() ?? '';

  const where: {
    assignments: { some: object };
    OR?: Array<{ fullName: { contains: string } } | { email: { contains: string } }>;
  } = { assignments: { some: {} } };
  if (q.length > 0) {
    where.OR = [{ fullName: { contains: q } }, { email: { contains: q } }];
  }

  const employeeSelect = {
    id: true,
    fullName: true,
    email: true,
    department: { select: { name: true } },
    location: { select: { name: true } },
    assignments: {
      select: { status: true, assignedAt: true, returnedAt: true },
    },
  } as const;

  const [employees, rowCount] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: { fullName: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({ rows: (employees as any[]).map(toEmployeeAssignmentRow), rowCount, pageCount });
}

// ─── Get Employee Assignments Detail ──────────────────────────────────────

export interface GetEmployeeAssignmentsResult {
  active: AssignmentRow[];
  history: AssignmentRow[];
}

export async function getEmployeeAssignmentsAction(
  employeeId: string,
): Promise<ActionResult<GetEmployeeAssignmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const assignments = await prisma.assignment.findMany({
    where: { employeeId },
    include: assignmentInclude,
    orderBy: { assignedAt: 'desc' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (assignments as any[]).map(toAssignmentRow);
  return ok({
    active: rows.filter((r) => r.status === 'ACTIVE'),
    history: rows.filter((r) => r.status !== 'ACTIVE'),
  });
}

// ─── Get Single Employee Row (for create-mode dialog) ────────────────────

export async function getEmployeeAssignmentRowAction(
  employeeId: string,
): Promise<ActionResult<EmployeeAssignmentRow>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      fullName: true,
      email: true,
      department: { select: { name: true } },
      location: { select: { name: true } },
      assignments: {
        select: { status: true, assignedAt: true, returnedAt: true },
      },
    },
  });

  if (!employee) return err('NOT_FOUND', 'Empleado no encontrado');
  return ok(toEmployeeAssignmentRow(employee as unknown as PrismaEmployeeWithAssignmentStats));
}

// ─── Search ────────────────────────────────────────────────────────────────

export async function searchAssignmentsAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');
  const q = query.trim();
  const rows = await prisma.assignment.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { asset: { assetCode: { contains: q } } },
        { employee: { fullName: { contains: q } } },
      ],
    },
    select: {
      id: true,
      asset: { select: { assetCode: true } },
      employee: { select: { fullName: true } },
    },
    take: 20,
    orderBy: { assignedAt: 'desc' },
  });
  return ok(
    rows.map((r) => ({
      code: r.id,
      value: `${r.asset.assetCode} — ${r.employee.fullName}`,
    })),
  );
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createAssignmentAction(
  input: CreateAssignmentDTO,
): Promise<ActionResult<AssignmentRow>> {
  const g = await requireWrite('create');
  if (!g.ok) return g.error;

  let dto: CreateAssignmentDTO;
  try {
    dto = (await createAssignmentSchema.validate(input, { abortEarly: false })) as CreateAssignmentDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findFirst({
      where: { assetId: dto.assetId, status: 'ACTIVE' },
    });
    if (existing) throw Object.assign(new Error('CONFLICT'), { isConflict: true });

    return tx.assignment.create({
      data: {
        assetId: dto.assetId,
        employeeId: dto.employeeId,
        notes: dto.notes ?? null,
        deliveredById: g.userId,
        status: 'ACTIVE',
      },
      include: assignmentInclude,
    });
  }).catch((e: unknown) => {
    if ((e as { isConflict?: boolean }).isConflict) return { __conflict: true } as const;
    throw e;
  });

  if ('__conflict' in result && result.__conflict) {
    return err('CONFLICT', 'El activo ya tiene una asignación activa');
  }

  revalidatePath('/assignments');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok(toAssignmentRow(result as any));
}

// ─── Return ────────────────────────────────────────────────────────────────

export async function returnAssignmentAction(
  id: string,
  input: ReturnAssignmentDTO,
): Promise<ActionResult<AssignmentRow>> {
  const g = await requireWrite('update');
  if (!g.ok) return g.error;

  let dto: ReturnAssignmentDTO;
  try {
    dto = (await returnAssignmentSchema.validate(input, { abortEarly: false })) as ReturnAssignmentDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      return tx.assignment.update({
        where: { id, status: 'ACTIVE' },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          notes: dto.notes ?? undefined,
        },
        include: assignmentInclude,
      });
    });
    revalidatePath('/assignments');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toAssignmentRow(updated as any));
  } catch (e) {
    if (isP2025(e)) return err('CONFLICT', 'La asignación ya fue cerrada');
    return err('UNKNOWN', 'Error al devolver asignación');
  }
}

// ─── Transfer ──────────────────────────────────────────────────────────────

export async function transferAssignmentAction(
  id: string,
  input: TransferAssignmentDTO,
): Promise<ActionResult<AssignmentRow>> {
  const g = await requireWrite('update');
  if (!g.ok) return g.error;

  let dto: TransferAssignmentDTO;
  try {
    dto = (await transferAssignmentSchema.validate(input, { abortEarly: false })) as TransferAssignmentDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const newAssignment = await prisma.$transaction(async (tx) => {
      // CAS: only update if status is ACTIVE
      const source = await tx.assignment.update({
        where: { id, status: 'ACTIVE' },
        data: { status: 'TRANSFERRED', returnedAt: new Date() },
        select: { assetId: true },
      });

      // Guard: check no other ACTIVE assignment for the same asset
      const conflict = await tx.assignment.findFirst({
        where: { assetId: source.assetId, status: 'ACTIVE' },
      });
      if (conflict) throw Object.assign(new Error('CONFLICT'), { isConflict: true });

      return tx.assignment.create({
        data: {
          assetId: source.assetId,
          employeeId: dto.newEmployeeId,
          notes: dto.notes ?? null,
          deliveredById: g.userId,
          status: 'ACTIVE',
        },
        include: assignmentInclude,
      });
    });

    revalidatePath('/assignments');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toAssignmentRow(newAssignment as any));
  } catch (e) {
    if ((e as { isConflict?: boolean }).isConflict) {
      return err('CONFLICT', 'El activo ya tiene una asignación activa');
    }
    if (isP2025(e)) return err('CONFLICT', 'La asignación ya fue cerrada');
    return err('UNKNOWN', 'Error al transferir asignación');
  }
}

// ─── Export Assignments ────────────────────────────────────────────────────

export async function exportAssignmentsAction(): Promise<ActionResult<{ base64: string; filename: string }>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  const assignments = await prisma.assignment.findMany({
    where: { status: 'ACTIVE' },
    select: {
      assignedAt: true,
      employee: { select: { fullName: true, email: true } },
      asset: { select: { assetCode: true, category: { select: { name: true } } } },
    },
    orderBy: { assignedAt: 'desc' },
  });

  const rows = assignments.map((a) => ({
    Empleado: a.employee.fullName,
    Email: a.employee.email,
    Activo: a.asset.assetCode,
    Categoría: a.asset.category?.name ?? '',
    'Fecha asignación': a.assignedAt.toISOString().split('T')[0],
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return ok({ base64: Buffer.from(buf).toString('base64'), filename: 'asignaciones-activas.xlsx' });
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteAssignmentAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite('delete');
  if (!g.ok) return g.error;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!assignment) return err('NOT_FOUND', 'Asignación no encontrada');
  if (assignment.status === 'ACTIVE')
    return err('CONFLICT', 'No se puede eliminar una asignación activa');

  await prisma.assignment.delete({ where: { id } });
  revalidatePath('/assignments');
  return ok(undefined);
}
