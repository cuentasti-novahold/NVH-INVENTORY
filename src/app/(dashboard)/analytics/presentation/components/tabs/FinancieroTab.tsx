import { DollarSign, TrendingDown, BookOpen } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import { ChartCard } from '../ChartCard';
import { DepreciationAreaChart } from '../charts/DepreciationAreaChart';
import { TopAssetsByValueChart } from '../charts/TopAssetsByValueChart';
import type { FinancieroData } from '../../dto/analytics.dto';

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    notation: v >= 1_000_000_000 ? 'compact' : 'standard',
  }).format(v);
}

export function FinancieroTab({ data }: { data: FinancieroData }) {
  const { kpis } = data;

  const retention =
    kpis.valorTotal > 0
      ? Math.round((kpis.valorLibro / kpis.valorTotal) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Valor Total Inventario"
          value={formatCOP(kpis.valorTotal)}
          icon={DollarSign}
          variant="accent"
          description="Costo original de adquisición en COP"
        />
        <KpiCard
          label="Depreciación Acumulada"
          value={formatCOP(kpis.depreciacionAcumulada)}
          icon={TrendingDown}
          variant="warning"
          description="Valor consumido por uso y tiempo"
        />
        <KpiCard
          label="Valor Libro"
          value={formatCOP(kpis.valorLibro)}
          icon={BookOpen}
          variant="success"
          description={`${retention}% del valor original retenido`}
        />
      </div>

      {/* Trend chart */}
      <ChartCard
        title="Tendencia Valor Libro vs Depreciación"
        description="Evolución histórica del portafolio de activos por período de snapshot"
      >
        <DepreciationAreaChart data={data.depreciationTrend} />
      </ChartCard>

      {/* Top assets */}
      <ChartCard
        title="Top 10 Activos por Valor de Adquisición"
        description="Activos con mayor valor original de compra — base de cálculo depreciación"
      >
        <TopAssetsByValueChart data={data.topAssets} />
      </ChartCard>
    </div>
  );
}
