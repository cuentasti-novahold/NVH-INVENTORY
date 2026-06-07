'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { addMonths, addYears } from 'date-fns';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import type { ExcelImportResult, ExcelRowError } from '@/shared/ui/types/excel-import.types';
import { calculateDepreciation } from '@/lib/depreciation';
import { locationHasBodegas } from '@/lib/location';
import { buildAssetCreateSchema, buildAssetUpdateSchema } from './presentation/schemas/asset.schema';
import { toAssetRow, toAssetDetailRow, assetInclude, assetDetailInclude } from './presentation/mappers/asset.mapper';
import type {
  AssetRow,
  AssetDetailRow,
  CreateAssetDTO,
  UpdateAssetDTO,
  AssetImportRow,
  AssetStatus,
} from './presentation/dto/asset.dto';

type Role = Parameters<typeof hasPermission>[0];
type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

async function requireWrite(): Promise<AuthCheck> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: err('UNAUTHORIZED', 'No autenticado') };
  if (!hasPermission(session.user.role as Role, 'assets', 'create'))
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
  const ve = e as { inner?: Array<{ path?: string; message: string }>; path?: string; message?: string };
  if (ve.inner?.length) {
    for (const i of ve.inner) if (i.path) out[i.path] = i.message;
  } else if (ve.path && ve.message) {
    out[ve.path] = ve.message;
  }
  return out;
}

async function computePurchasePriceBase(
  tx: Awaited<Parameters<Parameters<typeof prisma.$transaction>[0]>[0]>,
  purchasePrice: number,
  currencyCode: string | null | undefined,
  purchaseDateStr: string | null | undefined,
): Promise<number> {
  if (!currencyCode || currencyCode === 'COP' || !purchaseDateStr) return purchasePrice;
  const cur = await tx.currency.findUnique({ where: { code: currencyCode }, select: { id: true } });
  if (!cur) return purchasePrice;
  const rate = await tx.exchangeRate.findFirst({
    where: { currencyId: cur.id, effectiveDate: { lte: new Date(purchaseDateStr) } },
    orderBy: { effectiveDate: 'desc' },
    select: { rateToBase: true },
  });
  if (!rate) return purchasePrice;
  return purchasePrice * Number(rate.rateToBase);
}

function formatAssetCode(prefix: string, sequence: number): string {
  return `NVH-${prefix}-${sequence.toString().padStart(5, '0')}`;
}

// ─── List ──────────────────────────────────────────────────────────────────

import type { PageInfo } from '@/shared/types/pagination';

export interface ListAssetsParams {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  isActive?: 'active' | 'inactive' | 'all';
  q?: string;
  categoryId?: string;
  generalStatus?: string;
  locationId?: string;
}

export interface ListAssetsResult {
  rows: AssetRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

export async function listAssetsAction(
  params: ListAssetsParams = {},
): Promise<ActionResult<ListAssetsResult>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const limit = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const { afterCursor, beforeCursor } = params;
  const isActive = params.isActive ?? 'active';
  const q = params.q?.trim() ?? '';

  const filterWhere: Record<string, unknown> = {};
  if (isActive === 'active') filterWhere.isActive = true;
  else if (isActive === 'inactive') filterWhere.isActive = false;
  if (params.categoryId) filterWhere.categoryId = params.categoryId;
  if (params.generalStatus) filterWhere.generalStatus = params.generalStatus;
  if (params.locationId) filterWhere.locationId = params.locationId;
  if (q.length > 0) {
    filterWhere.OR = [
      { assetCode: { contains: q } },
      { brand: { contains: q } },
      { model: { contains: q } },
      { serialNumber: { contains: q } },
      { hostname: { contains: q } },
    ];
  }

  let cursorWhere: Record<string, unknown> = {};
  let orderBy: { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (afterCursor) {
    const pivot = await prisma.asset.findUnique({
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
    const pivot = await prisma.asset.findUnique({
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
    prisma.asset.findMany({
      where: finalWhere,
      orderBy,
      take: limit + 1,
      include: assetInclude,
    }),
    prisma.asset.count({ where: filterWhere }),
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
    rows: (data as any[]).map(toAssetRow),
    rowCount,
    pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor, limit },
  });
}

// ─── Search (autocomplete for assignments) ──────────────────────────────────

export async function searchAssetsAction(
  query: string,
): Promise<ActionResult<{ code: string; value: string }[]>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const q = query.trim();
  const rows = await prisma.asset.findMany({
    where: {
      isActive: true,
      OR: [
        { assetCode: { contains: q } },
        { brand: { contains: q } },
        { model: { contains: q } },
        { serialNumber: { contains: q } },
      ],
    },
    select: { id: true, assetCode: true, brand: true, model: true },
    take: 20,
    orderBy: { assetCode: 'asc' },
  });
  return ok(
    rows.map((r) => ({
      code: r.id,
      value: `${r.assetCode}${r.brand ? ` — ${r.brand}` : ''}${r.model ? ` ${r.model}` : ''}`,
    })),
  );
}

// ─── Get category fieldConfig (for dynamic form) ───────────────────────────

export interface CategoryMeta {
  fieldConfig: Record<string, string> | null;
  defaultUsefulLife: number | null;
  prefix: string;
}

export async function getCategoryFieldConfigAction(
  categoryId: string,
): Promise<ActionResult<CategoryMeta | null>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'categories', 'read'))
    return err('FORBIDDEN', 'Sin permiso');
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { prefix: true, fieldConfig: true, defaultUsefulLife: true },
  });
  if (!cat) return ok(null);
  return ok({
    fieldConfig: (cat.fieldConfig as Record<string, string> | null) ?? null,
    defaultUsefulLife: cat.defaultUsefulLife,
    prefix: cat.prefix,
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createAssetAction(
  input: CreateAssetDTO,
): Promise<ActionResult<AssetRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  const cat = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true, prefix: true, fieldConfig: true },
  });
  if (!cat) return err('NOT_FOUND', 'Categoría no encontrada');

  type FieldVisibility = 'required' | 'optional' | 'hidden';
  const fieldConfig = (cat.fieldConfig as Record<string, FieldVisibility>) ?? {};

  let dto: CreateAssetDTO;
  try {
    dto = (await buildAssetCreateSchema(fieldConfig).validate(input, {
      abortEarly: false,
    })) as CreateAssetDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  // Conditional bodega guard: if location has bodegas, bodegaId is required
  if (!dto.bodegaId && (await locationHasBodegas(prisma, dto.locationId!))) {
    return err('VALIDATION', 'Datos inválidos', {
      bodegaId: 'La bodega es obligatoria para esta sede',
    });
  }

  try {
    const asset = await prisma.$transaction(async (tx) => {
      let assetCode = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        const updatedCat = await tx.category.update({
          where: { id: cat.id },
          data: { sequence: { increment: 1 } },
          select: { sequence: true, prefix: true },
        });
        assetCode = formatAssetCode(updatedCat.prefix, updatedCat.sequence);
        const conflict = await tx.asset.findUnique({ where: { assetCode }, select: { id: true } });
        if (!conflict) break;
      }

      const purchasePriceBase =
        dto.purchasePrice != null
          ? await computePurchasePriceBase(tx, dto.purchasePrice, dto.currencyCode, dto.purchaseDate)
          : null;

      return tx.asset.create({
        data: {
          assetCode,
          categoryId: dto.categoryId,
          assetTag: dto.assetTag ?? null,
          hostname: dto.hostname ?? null,
          brand: dto.brand ?? null,
          model: dto.model ?? null,
          serialNumber: dto.serialNumber ?? null,
          processor: dto.processor ?? null,
          ram: dto.ram ?? null,
          storageCapacity: dto.storageCapacity ?? null,
          storageType: (dto.storageType as 'SSD' | 'HDD' | 'NVME' | 'EMMC') ?? null,
          operatingSystem: dto.operatingSystem ?? null,
          phoneNumber: dto.phoneNumber ?? null,
          imei: dto.imei ?? null,
          purchasePrice: dto.purchasePrice ?? null,
          currencyCode: dto.currencyCode ?? 'COP',
          purchasePriceBase: purchasePriceBase ?? null,
          salvageValue: dto.salvageValue ?? null,
          usefulLifeYears: dto.usefulLifeYears ?? null,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          generalStatus: (dto.generalStatus ?? 'GOOD') as 'GOOD' | 'REGULAR' | 'BAD' | 'DAMAGED' | 'RETIRED',
          functionalStatus: (dto.functionalStatus ?? 'GOOD') as 'GOOD' | 'REGULAR' | 'BAD' | 'DAMAGED' | 'RETIRED',
          notes: dto.notes ?? null,
          locationId: dto.locationId!,
          bodegaId: dto.bodegaId ?? null,
          parentAssetId: dto.parentAssetId ?? null,
        },
        include: assetInclude,
      });
    });

    revalidatePath('/assets');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toAssetRow(asset as any));
  } catch (e) {
    console.error('[createAssetAction]', e);
    if (isP2002(e, 'serialNumber'))
      return err('CONFLICT', 'Número de serie duplicado', {
        serialNumber: 'Ya existe un activo con este serial',
      });
    return err('UNKNOWN', 'Error al crear activo');
  }
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateAssetAction(
  id: string,
  input: UpdateAssetDTO,
): Promise<ActionResult<AssetRow>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  let dto: UpdateAssetDTO;
  try {
    dto = (await buildAssetUpdateSchema({}).validate(input, {
      abortEarly: false,
    })) as UpdateAssetDTO;
  } catch (e) {
    return err('VALIDATION', 'Datos inválidos', yupToFieldErrors(e));
  }

  try {
    const data: Record<string, unknown> = {};
    if (dto.brand !== undefined) data.brand = dto.brand ?? null;
    if (dto.model !== undefined) data.model = dto.model ?? null;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber ?? null;
    if (dto.assetTag !== undefined) data.assetTag = dto.assetTag ?? null;
    if (dto.hostname !== undefined) data.hostname = dto.hostname ?? null;
    if (dto.processor !== undefined) data.processor = dto.processor ?? null;
    if (dto.ram !== undefined) data.ram = dto.ram ?? null;
    if (dto.storageCapacity !== undefined) data.storageCapacity = dto.storageCapacity ?? null;
    if (dto.storageType !== undefined) data.storageType = dto.storageType ?? null;
    if (dto.operatingSystem !== undefined) data.operatingSystem = dto.operatingSystem ?? null;
    if (dto.phoneNumber !== undefined) data.phoneNumber = dto.phoneNumber ?? null;
    if (dto.imei !== undefined) data.imei = dto.imei ?? null;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice ?? null;
    if (dto.currencyCode !== undefined) data.currencyCode = dto.currencyCode ?? null;
    if (dto.salvageValue !== undefined) data.salvageValue = dto.salvageValue ?? null;
    if (dto.usefulLifeYears !== undefined) data.usefulLifeYears = dto.usefulLifeYears ?? null;
    if (dto.purchaseDate !== undefined) data.purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : null;
    if (dto.generalStatus !== undefined) data.generalStatus = dto.generalStatus;
    if (dto.functionalStatus !== undefined) data.functionalStatus = dto.functionalStatus;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.locationId !== undefined) data.locationId = dto.locationId ?? null;
    if (dto.bodegaId !== undefined) data.bodegaId = dto.bodegaId ?? null;
    if (dto.parentAssetId !== undefined) data.parentAssetId = dto.parentAssetId ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asset = await prisma.asset.update({ where: { id }, data: data as any, include: assetInclude });
    revalidatePath('/assets');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(toAssetRow(asset as any));
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Activo no encontrado');
    if (isP2002(e, 'serialNumber'))
      return err('CONFLICT', 'Número de serie duplicado', {
        serialNumber: 'Ya existe un activo con este serial',
      });
    return err('UNKNOWN', 'Error al actualizar activo');
  }
}

// ─── Deactivate ────────────────────────────────────────────────────────────

export async function deactivateAssetAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  try {
    await prisma.asset.update({ where: { id }, data: { isActive: false } });
    revalidatePath('/assets');
    return ok(undefined);
  } catch (e) {
    if (isP2025(e)) return err('NOT_FOUND', 'Activo no encontrado');
    return err('UNKNOWN', 'Error al desactivar activo');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteAssetAction(id: string): Promise<ActionResult<void>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;

  const row = await prisma.asset.findUnique({
    where: { id },
    select: { _count: { select: { assignments: true, components: true } } },
  });
  if (!row) return err('NOT_FOUND', 'Activo no encontrado');
  if (row._count.assignments > 0)
    return err(
      'HAS_CHILDREN',
      `No se puede eliminar: tiene ${row._count.assignments} asignaciones. Usá "Desactivar" en su lugar.`,
    );
  if (row._count.components > 0)
    return err(
      'HAS_CHILDREN',
      `No se puede eliminar: tiene ${row._count.components} componentes vinculados.`,
    );

  await prisma.asset.delete({ where: { id } });
  revalidatePath('/assets');
  return ok(undefined);
}

// ─── Import ────────────────────────────────────────────────────────────────

const VALID_STATUSES: AssetStatus[] = ['GOOD', 'REGULAR', 'BAD', 'DAMAGED', 'RETIRED'];

function parseStatus(v: string | null): AssetStatus {
  const upper = (v ?? '').toUpperCase() as AssetStatus;
  return VALID_STATUSES.includes(upper) ? upper : 'GOOD';
}

export async function importAssetsAction(
  rows: AssetImportRow[],
): Promise<ActionResult<ExcelImportResult>> {
  const g = await requireWrite();
  if (!g.ok) return g.error;
  const userId = g.userId;

  const errors: ExcelRowError[] = [];
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + 2;

    if (!r.category?.trim()) {
      errors.push({ row: rowNum, field: 'category', message: 'Categoría requerida' });
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const cat = await tx.category.findFirst({
          where: { name: { contains: r.category!.trim() } },
          select: { id: true, prefix: true },
        });
        if (!cat) throw new Error(`CATEGORY_NOT_FOUND:${r.category}`);

        const updatedCat = await tx.category.update({
          where: { id: cat.id },
          data: { sequence: { increment: 1 } },
          select: { sequence: true, prefix: true },
        });
        const assetCode = formatAssetCode(updatedCat.prefix, updatedCat.sequence);

        // Blank location guard: location is required for asset creation
        if (!r.location?.trim()) {
          throw new Error('LOCATION_NOT_FOUND:(vacío)');
        }

        let locationId: string | null = null;
        if (r.location?.trim()) {
          const loc = await tx.location.findFirst({
            where: { name: { contains: r.location.trim() } },
            select: { id: true },
          });
          if (!loc) throw new Error(`LOCATION_NOT_FOUND:${r.location}`);
          locationId = loc.id;
        }

        // Conditional bodega guard for importer: if location has bodegas, bodega column is required
        if (!r.bodega?.trim() && locationId && (await locationHasBodegas(tx, locationId))) {
          throw new Error('BODEGA_REQUIRED:(la sede requiere bodega)');
        }

        let bodegaId: string | null = null;
        if (r.bodega?.trim()) {
          const bod = await tx.bodega.findFirst({
            where: { name: { contains: r.bodega.trim() } },
            select: { id: true },
          });
          if (!bod) throw new Error(`BODEGA_NOT_FOUND:${r.bodega}`);
          bodegaId = bod.id;
        }

        const purchasePrice = r.purchasePrice != null ? Number(r.purchasePrice) : null;
        const purchasePriceBase =
          purchasePrice != null
            ? await computePurchasePriceBase(tx, purchasePrice, r.currencyCode, r.purchaseDate)
            : null;

        await tx.asset.create({
          data: {
            assetCode,
            categoryId: cat.id,
            brand: r.brand?.trim() || null,
            model: r.model?.trim() || null,
            serialNumber: r.serialNumber?.trim() || null,
            hostname: r.hostname?.trim() || null,
            assetTag: r.assetTag?.trim() || null,
            processor: r.processor?.trim() || null,
            ram: r.ram?.trim() || null,
            storageCapacity: r.storageCapacity?.trim() || null,
            operatingSystem: r.operatingSystem?.trim() || null,
            purchasePrice: purchasePrice ?? null,
            currencyCode: r.currencyCode?.trim() || 'COP',
            purchasePriceBase: purchasePriceBase ?? null,
            usefulLifeYears: r.usefulLifeYears != null ? Number(r.usefulLifeYears) : null,
            purchaseDate: r.purchaseDate ? new Date(r.purchaseDate) : null,
            generalStatus: parseStatus(r.generalStatus),
            functionalStatus: 'GOOD',
            notes: r.notes?.trim() || null,
            locationId: locationId!,
            bodegaId,
          },
        });
      });
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.startsWith('CATEGORY_NOT_FOUND:'))
        errors.push({ row: rowNum, field: 'category', message: `Categoría no encontrada: ${msg.split(':')[1]}` });
      else if (msg.startsWith('LOCATION_NOT_FOUND:'))
        errors.push({ row: rowNum, field: 'location', message: `Sede no encontrada: ${msg.split(':')[1]}` });
      else if (msg.startsWith('BODEGA_REQUIRED:'))
        errors.push({ row: rowNum, field: 'bodega', message: 'La sede requiere una bodega. Especificá la bodega en la columna correspondiente.' });
      else if (msg.startsWith('BODEGA_NOT_FOUND:'))
        errors.push({ row: rowNum, field: 'bodega', message: `Bodega no encontrada: ${msg.split(':')[1]}` });
      else if (isP2002(e, 'serialNumber'))
        errors.push({ row: rowNum, field: 'serialNumber', message: 'Número de serie duplicado' });
      else
        errors.push({ row: rowNum, message: 'Error al insertar' });
      skipped++;
    }
  }

  await prisma.importLog.create({
    data: {
      userId,
      entity: 'Asset',
      fileName: 'assets-import.xlsx',
      totalRows: rows.length,
      successRows: inserted,
      errorRows: skipped,
      errors: errors.length > 0 ? (JSON.parse(JSON.stringify(errors)) as object) : undefined,
      status: inserted === 0 && skipped > 0 ? 'FAILED' : 'COMPLETED',
    },
  });

  revalidatePath('/assets');
  return ok({ inserted, skipped, errors });
}

// ─── Asset Location (para el form de traslados) ────────────────────────────

export interface AssetLocationInfo {
  locationId: string | null;
  locationName: string | null;
  bodegaId: string | null;
  bodegaName: string | null;
}

export async function getAssetLocationAction(
  assetId: string,
): Promise<ActionResult<AssetLocationInfo>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      locationId: true,
      location: { select: { name: true } },
      bodegaId: true,
      bodega: { select: { name: true } },
    },
  });

  if (!asset) return err('NOT_FOUND', 'Activo no encontrado');

  return ok({
    locationId: asset.locationId,
    locationName: asset.location?.name ?? null,
    bodegaId: asset.bodegaId,
    bodegaName: asset.bodega?.name ?? null,
  });
}

// ─── Asset Detail ──────────────────────────────────────────────────────────

export async function getAssetDetailAction(
  assetCode: string,
): Promise<ActionResult<AssetDetailRow>> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const asset = await prisma.asset.findFirst({
    where: { assetCode },
    include: assetDetailInclude,
  });

  if (!asset) return err('NOT_FOUND', 'Activo no encontrado');

  return ok(toAssetDetailRow(asset as Parameters<typeof toAssetDetailRow>[0]));
}

// ─── Export helpers ────────────────────────────────────────────────────────

type ExportResult = ActionResult<{ base64: string; filename: string }>;

function buildXlsx(rows: Record<string, unknown>[], sheetName: string, filename: string): ExportResult {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return ok({ base64: Buffer.from(buf).toString('base64'), filename });
}

// ─── Export Inventory ──────────────────────────────────────────────────────

export async function exportInventoryAction(): Promise<ExportResult> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    include: {
      category: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: { assetCode: 'asc' },
  });

  const rows = assets.map((a) => ({
    Código: a.assetCode,
    Categoría: (a as unknown as { category: { name: string } }).category?.name ?? '',
    Marca: a.brand ?? '',
    Modelo: a.model ?? '',
    Serial: a.serialNumber ?? '',
    Estado: a.generalStatus,
    Sede: (a as unknown as { location: { name: string } | null }).location?.name ?? '',
    'Precio COP': a.purchasePriceBase ? Number(a.purchasePriceBase.toString()) : '',
    'Fecha compra': a.purchaseDate ? a.purchaseDate.toISOString().split('T')[0] : '',
    'Vida útil (años)': a.usefulLifeYears ?? '',
  }));

  return buildXlsx(rows, 'Inventario', 'inventario-activos.xlsx');
}

// ─── Export Depreciation ───────────────────────────────────────────────────

export async function exportDepreciationAction(): Promise<ExportResult> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    include: { category: { select: { name: true } } },
    orderBy: { assetCode: 'asc' },
  });

  const rows = assets.map((a) => {
    const base = a.purchasePriceBase ? Number(a.purchasePriceBase.toString()) : 0;
    const salvage = a.salvageValue ? Number(a.salvageValue.toString()) : 0;
    const depr = calculateDepreciation(base, salvage, a.usefulLifeYears ?? 0, a.purchaseDate);
    return {
      Código: a.assetCode,
      Categoría: (a as unknown as { category: { name: string } }).category?.name ?? '',
      'Precio compra COP': base,
      'Valor residual COP': salvage,
      'Vida útil (años)': a.usefulLifeYears ?? '',
      'Años transcurridos': depr.yearsElapsed,
      'Depreciación acumulada COP': Math.round(depr.accumulated),
      'Valor libro COP': Math.round(depr.bookValue),
    };
  });

  return buildXlsx(rows, 'Depreciación', 'depreciacion-activos.xlsx');
}

// ─── Export Expiring Assets ────────────────────────────────────────────────

export async function exportExpiringAction(months: 3 | 6 | 12 = 6): Promise<ExportResult> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read'))
    return err('FORBIDDEN', 'Sin permiso');

  const assets = await prisma.asset.findMany({
    where: { isActive: true, purchaseDate: { not: null }, usefulLifeYears: { not: null } },
    include: { category: { select: { name: true } } },
  });

  const now = new Date();
  const cutoff = addMonths(now, months);

  const expiring = assets.filter((a) => {
    const expiryDate = addYears(a.purchaseDate!, a.usefulLifeYears!);
    return expiryDate >= now && expiryDate <= cutoff;
  });

  const rows = expiring.map((a) => ({
    Código: a.assetCode,
    Categoría: (a as unknown as { category: { name: string } }).category?.name ?? '',
    Marca: a.brand ?? '',
    'Fecha compra': a.purchaseDate!.toISOString().split('T')[0],
    'Vida útil (años)': a.usefulLifeYears!,
    'Fecha vencimiento': addYears(a.purchaseDate!, a.usefulLifeYears!).toISOString().split('T')[0],
  }));

  return buildXlsx(rows, 'Por vencer', `activos-por-vencer-${months}m.xlsx`);
}

// ─── Asset History ─────────────────────────────────────────────────────────

export interface AssetHistoryAssignment {
  employeeName: string;
  assignedAt: string;
  returnedAt: string | null;
  status: string;
}

export interface AssetHistoryMaintenance {
  type: string;
  description: string | null;
  performedAt: string;
}

export interface AssetHistoryData {
  asset: AssetDetailRow;
  assignments: AssetHistoryAssignment[];
  maintenances: AssetHistoryMaintenance[];
}

export async function getAssetHistoryAction(
  assetCode: string,
): Promise<ActionResult<AssetHistoryData>> {
  const session = await auth();
  if (!session?.user) return err('UNAUTHORIZED', 'No autenticado');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = await prisma.asset.findFirst({
    where: { assetCode },
    include: {
      category: { select: { name: true, prefix: true, fieldConfig: true } },
      location: { select: { name: true } },
      bodega: { select: { name: true } },
      parentAsset: { select: { assetCode: true } },
      _count: { select: { assignments: true, components: true } },
      assignments: {
        include: { employee: { select: { id: true, fullName: true } } },
        orderBy: { assignedAt: 'desc' as const },
      },
      maintenances: {
        orderBy: { performedAt: 'asc' as const },
        select: { type: true, description: true, performedAt: true },
      },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  if (!asset) return err('NOT_FOUND', 'Activo no encontrado');

  // Build detail row using the active assignment
  const activeAssignment =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (asset.assignments as any[]).find((a: any) => a.returnedAt === null) ?? null;
  const assetForDetail = { ...asset, assignments: activeAssignment ? [activeAssignment] : [] };
  const assetRow = toAssetDetailRow(assetForDetail as Parameters<typeof toAssetDetailRow>[0]);

  return ok({
    asset: assetRow,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: (asset.assignments as any[]).map((a: any) => ({
      employeeName: a.employee?.fullName ?? '',
      assignedAt: (a.assignedAt as Date).toISOString(),
      returnedAt: a.returnedAt ? (a.returnedAt as Date).toISOString() : null,
      status: a.status as string,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    maintenances: (asset.maintenances as any[]).map((m: any) => ({
      type: m.type as string,
      description: m.description as string | null,
      performedAt: (m.performedAt as Date).toISOString(),
    })),
  });
}
