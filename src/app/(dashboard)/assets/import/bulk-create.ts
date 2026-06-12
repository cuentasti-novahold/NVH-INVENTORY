// Server-only — imports Prisma. Do NOT import from Client Components.

import { prisma } from '@/lib/prisma';
import { writeImportLog } from '@/shared/excel-import/log';
import { locationHasBodegas } from '@/lib/location';
import { nextAssetCode } from '@/lib/inventory/asset-code';
import type { ImportConfirmResult } from '@/shared/excel-import/types';
import type { AssetImportRow } from './config';

type AssetStatus = 'GOOD' | 'REGULAR' | 'BAD' | 'DAMAGED' | 'RETIRED';

const VALID_STATUSES: AssetStatus[] = ['GOOD', 'REGULAR', 'BAD', 'DAMAGED', 'RETIRED'];

function parseStatus(v: string | null): AssetStatus {
  const upper = (v ?? '').toUpperCase() as AssetStatus;
  return VALID_STATUSES.includes(upper) ? upper : 'GOOD';
}

type PrismaTx = Awaited<Parameters<Parameters<typeof prisma.$transaction>[0]>[0]>;

async function computePurchasePriceBase(
  tx: PrismaTx,
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

function isP2002(e: unknown, target: string): boolean {
  const err = e as { code?: string; meta?: { target?: string | string[] }; message?: string };
  if (err?.code !== 'P2002') return false;
  const t = err.meta?.target;
  if (typeof t === 'string') return t.includes(target);
  if (Array.isArray(t)) return t.includes(target);
  return typeof err.message === 'string' && err.message.includes(target);
}

export async function bulkCreateAssets(
  rows: AssetImportRow[],
  userId: string,
  fileName: string,
): Promise<ImportConfirmResult> {
  const result: ImportConfirmResult = {
    totalReceived: rows.length,
    created: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;

    if (!r.category) {
      result.failed++;
      result.errors.push({ index: i, data: r as unknown as Record<string, unknown>, error: 'Categoría requerida' });
      continue;
    }

    if (!r.location) {
      result.failed++;
      result.errors.push({ index: i, data: r as unknown as Record<string, unknown>, error: 'Sede requerida' });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // MAC-04: resolve company FIRST (before category) — required for asset code generation
        const companyCode = r.company?.trim().toUpperCase() ?? null;
        const comp = await tx.company.findFirst({
          where: companyCode ? { code: companyCode } : undefined,
          orderBy: companyCode ? undefined : { createdAt: 'asc' },
          select: { id: true, code: true },
        });
        if (!comp) throw new Error(`COMPANY_NOT_FOUND:${companyCode ?? '(no company)'}`);

        const cat = await tx.category.findFirst({
          where: { name: { contains: r.category! } },
          select: { id: true, prefix: true },
        });
        if (!cat) throw new Error(`CATEGORY_NOT_FOUND:${r.category}`);

        // Use atomic junction-based asset code (ACG-01)
        const assetCode = await nextAssetCode(tx, comp.id, cat.id, comp.code, cat.prefix);

        const loc = await tx.location.findFirst({
          where: { name: { contains: r.location! } },
          select: { id: true },
        });
        if (!loc) throw new Error(`LOCATION_NOT_FOUND:${r.location}`);

        if (!r.bodega && (await locationHasBodegas(tx, loc.id))) {
          throw new Error('BODEGA_REQUIRED');
        }

        let bodegaId: string | null = null;
        if (r.bodega) {
          const bod = await tx.bodega.findFirst({
            where: { name: { contains: r.bodega } },
            select: { id: true },
          });
          if (!bod) throw new Error(`BODEGA_NOT_FOUND:${r.bodega}`);
          bodegaId = bod.id;
        }

        const purchasePriceBase =
          r.purchasePrice != null
            ? await computePurchasePriceBase(tx, r.purchasePrice, r.currencyCode, r.purchaseDate)
            : null;

        await tx.asset.create({
          data: {
            assetCode,
            companyId: comp.id,
            categoryId: cat.id,
            brand: r.brand ?? null,
            model: r.model ?? null,
            serialNumber: r.serialNumber ?? null,
            hostname: r.hostname ?? null,
            assetTag: r.assetTag ?? null,
            processor: r.processor ?? null,
            ram: r.ram ?? null,
            storageCapacity: r.storageCapacity ?? null,
            storageType: (r.storageType as 'SSD' | 'HDD' | 'NVME' | 'EMMC' | null) ?? null,
            operatingSystem: r.operatingSystem ?? null,
            purchasePrice: r.purchasePrice ?? null,
            currencyCode: r.currencyCode ?? 'COP',
            purchasePriceBase: purchasePriceBase ?? null,
            usefulLifeYears: r.usefulLifeYears ?? null,
            purchaseDate: r.purchaseDate ? new Date(r.purchaseDate) : null,
            generalStatus: parseStatus(r.generalStatus),
            functionalStatus: 'GOOD',
            notes: r.notes ?? null,
            locationId: loc.id,
            bodegaId,
          },
        });
      });

      result.created++;
    } catch (e) {
      result.failed++;
      const msg = e instanceof Error ? e.message : '';
      let error: string;
      if (msg.startsWith('COMPANY_NOT_FOUND:'))
        error = `Empresa no encontrada: ${msg.split(':')[1]}`;
      else if (msg.startsWith('CATEGORY_NOT_FOUND:'))
        error = `Categoría no encontrada: ${msg.split(':')[1]}`;
      else if (msg.startsWith('LOCATION_NOT_FOUND:'))
        error = `Sede no encontrada: ${msg.split(':')[1]}`;
      else if (msg === 'BODEGA_REQUIRED')
        error = 'La sede requiere una bodega';
      else if (msg.startsWith('BODEGA_NOT_FOUND:'))
        error = `Bodega no encontrada: ${msg.split(':')[1]}`;
      else if (isP2002(e, 'serialNumber'))
        error = 'Número de serie duplicado';
      else
        error = 'Error al crear activo';

      result.errors.push({ index: i, data: r as unknown as Record<string, unknown>, error });
    }
  }

  await writeImportLog('Asset', result, userId, fileName);

  return result;
}
