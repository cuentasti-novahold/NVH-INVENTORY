'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { writeAudit, AuditActions, getRequestMeta } from '@/lib/audit';
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

import type { PageInfo } from '@/shared/types/pagination';

export interface ListAssignmentsParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  status?: 'ACTIVE' | 'RETURNED' | 'TRANSFERRED' | 'all';
  q?: string;
}

export interface ListAssignmentsResult {
  rows: AssignmentRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listAssignmentsAction(
  params: ListAssignmentsParams = {},
): Promise<ActionResult<ListAssignmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const status = params.status ?? 'ACTIVE';
  const q = params.q?.trim() ?? '';

  const filterWhere: Record<string, unknown> = {};
  if (status !== 'all') filterWhere.status = status;
  if (q.length > 0) {
    filterWhere.OR = [
      { asset: { assetCode: { contains: q } } },
      { asset: { brand: { contains: q } } },
      { asset: { model: { contains: q } } },
      { employee: { fullName: { contains: q } } },
    ];
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.assignment.findUnique({
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
    const pivot = await prisma.assignment.findUnique({
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
    prisma.assignment.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: assignmentInclude,
    }),
    prisma.assignment.count({ where: filterWhere }),
  ]);

  const hasExtraRow = rows.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  const trimmed = hasExtraRow ? rows.slice(0, -1) : rows;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({
    rows: (data as any[]).map(toAssignmentRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

// ─── List by Employee ──────────────────────────────────────────────────────

export interface ListEmployeeAssignmentsParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  q?: string;
  status?: 'ACTIVE' | 'RETURNED' | 'TRANSFERRED' | 'all';
}

export interface ListEmployeeAssignmentsResult {
  rows: EmployeeAssignmentRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listEmployeeAssignmentsAction(
  params: ListEmployeeAssignmentsParams = {},
): Promise<ActionResult<ListEmployeeAssignmentsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const q = params.q?.trim() ?? '';
  const status = params.status ?? 'all';

  const assignmentFilter = status !== 'all' ? { status } : {};
  const filterWhere: {
    assignments: { some: object };
    OR?: Array<{ fullName: { contains: string } } | { email: { contains: string } }>;
  } = { assignments: { some: assignmentFilter } };
  if (q.length > 0) {
    filterWhere.OR = [{ fullName: { contains: q } }, { email: { contains: q } }];
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

  const hasCursor = Object.keys(cursorWhere).length > 0;
  const finalWhere = hasCursor
    ? { AND: [cursorWhere, filterWhere] }
    : filterWhere;

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
      where: finalWhere,
      select: employeeSelect,
      orderBy,
      take: limit + 1,
    }),
    prisma.employee.count({ where: filterWhere }),
  ]);

  const hasExtraRow = employees.length > limit;
  const hasNextPage = beforeCursor ? !!(afterCursor || beforeCursor) : hasExtraRow;
  const hasPreviousPage = beforeCursor ? hasExtraRow : !!afterCursor;

  const trimmed = hasExtraRow ? employees.slice(0, -1) : employees;
  const data = beforeCursor ? [...trimmed].reverse() : trimmed;

  const startCursor = data.length > 0 ? data[0].id : undefined;
  const endCursor = data.length > 0 ? data[data.length - 1].id : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ok({
    rows: (data as any[]).map(toEmployeeAssignmentRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
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

  const { ip, userAgent } = await getRequestMeta();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findFirst({
      where: { assetId: dto.assetId, status: 'ACTIVE' },
    });
    if (existing) throw Object.assign(new Error('CONFLICT'), { isConflict: true });

    const created = await tx.assignment.create({
      data: {
        assetId: dto.assetId,
        employeeId: dto.employeeId,
        notes: dto.notes ?? null,
        deliveredById: g.userId,
        status: 'ACTIVE',
      },
      include: assignmentInclude,
    });

    await writeAudit(tx, {
      userId: g.userId,
      action: AuditActions.CREATE,
      entity: 'Assignment',
      entityId: created.id,
      before: null,
      after: {
        assetId: created.assetId,
        employeeId: created.employeeId,
        assignedAt: created.assignedAt,
        status: created.status,
      },
      ip,
      userAgent,
    });

    return created;
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

  const { ip, userAgent } = await getRequestMeta();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.assignment.update({
        where: { id, status: 'ACTIVE' },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          notes: dto.notes ?? undefined,
        },
        include: assignmentInclude,
      });

      await writeAudit(tx, {
        userId: g.userId,
        action: AuditActions.RETURNED,
        entity: 'Assignment',
        entityId: id,
        before: { status: 'ACTIVE' },
        after: { status: 'RETURNED', returnedAt: result.returnedAt },
        ip,
        userAgent,
      });

      return result;
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

  const { ip, userAgent } = await getRequestMeta();

  try {
    const newAssignment = await prisma.$transaction(async (tx) => {
      // Fetch old employeeId BEFORE closing source (for audit before snapshot)
      const sourceSnapshot = await tx.assignment.findUnique({
        where: { id },
        select: { employeeId: true, status: true },
      });
      const oldEmployeeId = sourceSnapshot?.employeeId ?? null;

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

      const created = await tx.assignment.create({
        data: {
          assetId: source.assetId,
          employeeId: dto.newEmployeeId,
          notes: dto.notes ?? null,
          deliveredById: g.userId,
          status: 'ACTIVE',
        },
        include: assignmentInclude,
      });

      await writeAudit(tx, {
        userId: g.userId,
        action: AuditActions.TRANSFERRED,
        entity: 'Assignment',
        entityId: id,
        before: { employeeId: oldEmployeeId, status: 'ACTIVE' },
        after: { employeeId: dto.newEmployeeId, status: 'ACTIVE', newAssignmentId: created.id },
        ip,
        userAgent,
      });

      return created;
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

  const { ip, userAgent } = await getRequestMeta();

  try {
    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.assignment.findUnique({
        where: { id },
        select: { assetId: true, employeeId: true, status: true },
      });

      await writeAudit(tx, {
        userId: g.userId,
        action: AuditActions.DELETE,
        entity: 'Assignment',
        entityId: id,
        before: snapshot,
        after: null,
        ip,
        userAgent,
      });

      await tx.assignment.delete({ where: { id } });
    });
    revalidatePath('/assignments');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Asignación no encontrada');
    return err('UNKNOWN', 'Error al eliminar asignación');
  }
}
