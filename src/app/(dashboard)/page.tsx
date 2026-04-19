import Link from 'next/link';
import { auth } from '@/auth';

export default async function DashboardHomePage() {
  const session = await auth();
  const name = session?.user?.name ?? 'Usuario';

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bienvenido, {name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Panel de control del sistema de inventario Novahold.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Comenzá desde la barra lateral</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seleccioná un módulo para ver activos, empleados, asignaciones o
          catálogos.
        </p>
        <Link
          href="/assets"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ver activos
        </Link>
      </div>
    </div>
  );
}
