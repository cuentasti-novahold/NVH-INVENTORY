'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import type {
  InventarioData,
  FinancieroData,
  AsignacionesData,
  MovimientosData,
  ChartEntry,
  TimeSeriesEntry,
} from './presentation/dto/analytics.dto';

type Role = Parameters<typeof hasPermission>[0];

async function requireRead() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read')) {
    throw new Error('FORBIDDEN');
  }
}

// ─── Inventario ───────────────────────────────────────────────────────────────

export async function getInventarioDataAction(): Promise<InventarioData> {
  await requireRead();

  const [totalAssets, totalCategorias, byActiveRaw, byCategoryRaw, byStatusRaw, byLocationRaw] =
    await Promise.all([
      prisma.asset.count(),
      prisma.category.count(),
      prisma.asset.groupBy({ by: ['isActive'], _count: { _all: true } }),
      prisma.asset.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
        orderBy: { _count: { categoryId: 'desc' } },
      }),
      prisma.asset.groupBy({
        by: ['functionalStatus'],
        _count: { _all: true },
        orderBy: { _count: { functionalStatus: 'desc' } },
      }),
      prisma.asset.groupBy({
        by: ['locationId'],
        _count: { _all: true },
        orderBy: { _count: { locationId: 'desc' } },
        take: 10,
      }),
    ]);

  const categoryIds = byCategoryRaw.map((r) => r.categoryId).filter(Boolean) as string[];
  const locationIds = byLocationRaw.map((r) => r.locationId).filter(Boolean) as string[];

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } }),
  ]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  return {
    kpis: {
      total: totalAssets,
      categorias: totalCategorias,
      activos: byActiveRaw.find((r) => r.isActive === true)?._count._all ?? 0,
      inactivos: byActiveRaw.find((r) => r.isActive === false)?._count._all ?? 0,
    },
    byCategory: byCategoryRaw.map((r) => ({
      label: categoryMap[r.categoryId] ?? 'Sin categoría',
      value: r._count._all,
    })),
    byStatus: byStatusRaw.map((r) => ({
      label: r.functionalStatus,
      value: r._count._all,
    })),
    byLocation: byLocationRaw
      .filter((r) => r.locationId !== null)
      .map((r) => ({
        label: locationMap[r.locationId!] ?? 'Sin sede',
        value: r._count._all,
      })),
  };
}

// ─── Financiero ───────────────────────────────────────────────────────────────

interface RawTrendRow {
  month: string;
  valorLibro: string;
  depreciacionAcumulada: string;
}

export async function getFinancieroDataAction(): Promise<FinancieroData> {
  await requireRead();

  const [sumResult, snapshotSums, trendRaw, topAssetsRaw] = await Promise.all([
    prisma.asset.aggregate({ _sum: { purchasePriceBase: true }, where: { isActive: true } }),
    prisma.$queryRaw<{ bookValue: string; accumulated: string }[]>`
      SELECT SUM(ds.bookValueBase) as bookValue, SUM(ds.accumulatedDeprBase) as accumulated
      FROM depreciation_snapshots ds
      INNER JOIN (
        SELECT assetId, MAX(snapshotDate) as maxDate
        FROM depreciation_snapshots
        GROUP BY assetId
      ) latest ON ds.assetId = latest.assetId AND ds.snapshotDate = latest.maxDate
    `,
    prisma.$queryRaw<RawTrendRow[]>`
      SELECT
        DATE_FORMAT(snapshotDate, '%Y-%m') as month,
        SUM(bookValueBase) as valorLibro,
        SUM(accumulatedDeprBase) as depreciacionAcumulada
      FROM depreciation_snapshots
      GROUP BY DATE_FORMAT(snapshotDate, '%Y-%m')
      ORDER BY month ASC
      LIMIT 12
    `,
    prisma.asset.findMany({
      where: { isActive: true, purchasePriceBase: { not: null } },
      orderBy: { purchasePriceBase: 'desc' },
      take: 10,
      select: { assetCode: true, purchasePriceBase: true, brand: true, model: true },
    }),
  ]);

  const snap = snapshotSums[0];

  return {
    kpis: {
      valorTotal: Number(sumResult._sum.purchasePriceBase ?? 0),
      depreciacionAcumulada: Number(snap?.accumulated ?? 0),
      valorLibro: Number(snap?.bookValue ?? 0),
    },
    depreciationTrend: trendRaw.map((r) => ({
      month: r.month,
      valorLibro: Number(r.valorLibro ?? 0),
      depreciacionAcumulada: Number(r.depreciacionAcumulada ?? 0),
    })),
    topAssets: topAssetsRaw.map((a) => ({
      label: [a.brand, a.model].filter(Boolean).join(' ') || a.assetCode,
      value: Number(a.purchasePriceBase ?? 0),
    })),
  };
}

// ─── Asignaciones ─────────────────────────────────────────────────────────────

export async function getAsignacionesDataAction(): Promise<AsignacionesData> {
  await requireRead();

  const [byStatusRaw, totalActiveAssets, topEmployeesRaw] = await Promise.all([
    prisma.assignment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.asset.count({ where: { isActive: true } }),
    prisma.assignment.groupBy({
      by: ['employeeId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
      orderBy: { _count: { employeeId: 'desc' } },
      take: 10,
    }),
  ]);

  const activas = byStatusRaw.find((r) => r.status === 'ACTIVE')?._count._all ?? 0;
  const retornadas = byStatusRaw.find((r) => r.status === 'RETURNED')?._count._all ?? 0;
  const disponibles = Math.max(0, totalActiveAssets - activas);
  const tasaUtilizacion = totalActiveAssets > 0 ? Math.round((activas / totalActiveAssets) * 1000) / 10 : 0;

  const employeeIds = topEmployeesRaw.map((r) => r.employeeId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, fullName: true },
  });
  const employeeMap = Object.fromEntries(employees.map((e) => [e.id, e.fullName]));

  return {
    kpis: { activas, disponibles, retornadas, tasaUtilizacion },
    distribution: [
      { label: 'Asignados', value: activas },
      { label: 'Disponibles', value: disponibles },
    ],
    topEmployees: topEmployeesRaw.map((r) => ({
      label: employeeMap[r.employeeId] ?? r.employeeId,
      value: r._count._all,
    })),
  };
}

// ─── Movimientos ──────────────────────────────────────────────────────────────

interface RawTimelineRow {
  month: string;
  tipo: string;
  count: bigint;
}

interface RawTypeRow {
  tipo: string;
  count: bigint;
}

export async function getMovimientosDataAction(): Promise<MovimientosData> {
  await requireRead();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [total, esteMes, timelineRaw, byTypeRaw] = await Promise.all([
    prisma.assetMovement.count(),
    prisma.assetMovement.count({ where: { movedAt: { gte: startOfMonth } } }),
    prisma.$queryRaw<RawTimelineRow[]>`
      SELECT
        DATE_FORMAT(movedAt, '%Y-%m') as month,
        movementType as tipo,
        COUNT(*) as count
      FROM asset_movements
      WHERE movedAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(movedAt, '%Y-%m'), movementType
      ORDER BY month ASC
    `,
    prisma.$queryRaw<RawTypeRow[]>`
      SELECT movementType as tipo, COUNT(*) as count
      FROM asset_movements
      GROUP BY movementType
      ORDER BY count DESC
    `,
  ]);

  const tipoMasFrecuente = byTypeRaw.length > 0 ? byTypeRaw[0].tipo : '—';

  const months = [...new Set(timelineRaw.map((r) => r.month))].sort();
  const tipos = [...new Set(timelineRaw.map((r) => r.tipo))];
  const timeline: TimeSeriesEntry[] = months.map((month) => {
    const entry: TimeSeriesEntry = { month };
    for (const tipo of tipos) {
      const row = timelineRaw.find((r) => r.month === month && r.tipo === tipo);
      entry[tipo] = Number(row?.count ?? 0);
    }
    return entry;
  });

  const byType: ChartEntry[] = byTypeRaw.map((r) => ({
    label: r.tipo,
    value: Number(r.count),
  }));

  return {
    kpis: { total, esteMes, tipoMasFrecuente },
    timeline,
    byType,
  };
}
