import { ClipboardList, PackageOpen, RotateCcw, Percent } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import { ChartCard } from '../ChartCard';
import { AssignmentsPieChart } from '../charts/AssignmentsPieChart';
import { TopEmployeesChart } from '../charts/TopEmployeesChart';
import type { AsignacionesData } from '../../dto/analytics.dto';

function utilizacionVariant(rate: number) {
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'accent';
  return 'warning';
}

export function AsignacionesTab({ data }: { data: AsignacionesData }) {
  const { kpis } = data;
  const variant = utilizacionVariant(kpis.tasaUtilizacion);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Asignaciones Activas"
          value={kpis.activas.toLocaleString('es-CO')}
          icon={ClipboardList}
          variant="primary"
          description="Activos en uso por empleados"
        />
        <KpiCard
          label="Activos Disponibles"
          value={kpis.disponibles.toLocaleString('es-CO')}
          icon={PackageOpen}
          variant="neutral"
          description="Sin asignación activa"
        />
        <KpiCard
          label="Retornadas"
          value={kpis.retornadas.toLocaleString('es-CO')}
          icon={RotateCcw}
          variant="neutral"
          description="Asignaciones cerradas"
        />
        <KpiCard
          label="Tasa de Utilización"
          value={kpis.tasaUtilizacion}
          suffix="%"
          icon={Percent}
          variant={variant}
          description={
            kpis.tasaUtilizacion >= 80
              ? 'Utilización óptima'
              : kpis.tasaUtilizacion >= 50
              ? 'Capacidad moderada'
              : 'Baja utilización'
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ChartCard
          title="Asignados vs Disponibles"
          description="Proporción actual del parque de activos"
        >
          <AssignmentsPieChart data={data.distribution} />
        </ChartCard>

        <ChartCard
          title="Top 10 Empleados"
          description="Empleados con más activos asignados actualmente"
        >
          <TopEmployeesChart data={data.topEmployees} />
        </ChartCard>
      </div>
    </div>
  );
}
