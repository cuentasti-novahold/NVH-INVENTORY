import { Package, Boxes, CheckCircle2, XCircle } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import { ChartCard } from '../ChartCard';
import { AssetsByCategoryChart } from '../charts/AssetsByCategoryChart';
import { FunctionalStatusChart } from '../charts/FunctionalStatusChart';
import { AssetsByLocationChart } from '../charts/AssetsByLocationChart';
import type { InventarioData } from '../../dto/analytics.dto';

export function InventarioTab({ data }: { data: InventarioData }) {
  const { kpis } = data;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Activos"
          value={kpis.total.toLocaleString('es-CO')}
          icon={Package}
          variant="primary"
          description="Todos los activos registrados"
        />
        <KpiCard
          label="Categorías"
          value={kpis.categorias}
          icon={Boxes}
          variant="neutral"
          description="Tipos de activo distintos"
        />
        <KpiCard
          label="Activos"
          value={kpis.activos.toLocaleString('es-CO')}
          icon={CheckCircle2}
          variant="success"
          description="En uso actualmente"
        />
        <KpiCard
          label="Inactivos"
          value={kpis.inactivos}
          icon={XCircle}
          variant="warning"
          description="Fuera de servicio"
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ChartCard
          title="Distribución por Categoría"
          description="Composición del inventario por tipo de activo"
        >
          <AssetsByCategoryChart data={data.byCategory} />
        </ChartCard>

        <ChartCard
          title="Estado Funcional"
          description="Condición técnica actual de los activos"
        >
          <FunctionalStatusChart data={data.byStatus} />
        </ChartCard>
      </div>

      <ChartCard
        title="Activos por Sede"
        description="Distribución geográfica del inventario — top 10 ubicaciones"
      >
        <AssetsByLocationChart data={data.byLocation} />
      </ChartCard>
    </div>
  );
}
