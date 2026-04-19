import { ArrowRightLeft, Calendar, TrendingUp } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import { ChartCard } from '../ChartCard';
import { MovementsTimelineChart } from '../charts/MovementsTimelineChart';
import { MovementsByTypeChart } from '../charts/MovementsByTypeChart';
import type { MovimientosData } from '../../dto/analytics.dto';

const TYPE_LABELS: Record<string, string> = {
  RELOCATION: 'Reubicación',
  LOAN: 'Préstamo',
  REPAIR: 'Reparación',
  RETURN_FROM_REPAIR: 'Retorno reparación',
  AUDIT: 'Auditoría',
};

export function MovimientosTab({ data }: { data: MovimientosData }) {
  const { kpis } = data;
  const labelFrecuente = TYPE_LABELS[kpis.tipoMasFrecuente] ?? kpis.tipoMasFrecuente;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Total Movimientos"
          value={kpis.total.toLocaleString('es-CO')}
          icon={ArrowRightLeft}
          variant="accent"
          description="Traslados físicos registrados"
        />
        <KpiCard
          label="Este Mes"
          value={kpis.esteMes.toLocaleString('es-CO')}
          icon={Calendar}
          variant={kpis.esteMes > 0 ? 'primary' : 'neutral'}
          description="Movimientos en el mes actual"
        />
        <KpiCard
          label="Tipo más frecuente"
          value={labelFrecuente}
          icon={TrendingUp}
          variant="neutral"
          description="Motivo de traslado predominante"
        />
      </div>

      {/* Timeline — full width */}
      <ChartCard
        title="Movimientos por Mes"
        description="Últimos 6 meses — desglose por tipo de traslado"
      >
        <MovementsTimelineChart data={data.timeline} />
      </ChartCard>

      {/* Distribution */}
      <ChartCard
        title="Distribución por Tipo"
        description="Proporción histórica de cada motivo de movimiento"
      >
        <MovementsByTypeChart data={data.byType} />
      </ChartCard>
    </div>
  );
}
