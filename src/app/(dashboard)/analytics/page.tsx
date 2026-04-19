import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import {
  getInventarioDataAction,
  getFinancieroDataAction,
  getAsignacionesDataAction,
  getMovimientosDataAction,
} from './actions';
import { AnalyticsDashboard } from './presentation/components/AnalyticsDashboard';

type Role = Parameters<typeof hasPermission>[0];

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read')) {
    redirect('/');
  }

  const [inventario, financiero, asignaciones, movimientos] = await Promise.all([
    getInventarioDataAction(),
    getFinancieroDataAction(),
    getAsignacionesDataAction(),
    getMovimientosDataAction(),
  ]);

  return (
    <AnalyticsDashboard
      inventario={inventario}
      financiero={financiero}
      asignaciones={asignaciones}
      movimientos={movimientos}
    />
  );
}
