import { Wrench } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
        <Wrench className="h-8 w-8 text-amber-500" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Módulo en construcción</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          El módulo de mantenimiento está en desarrollo. Pronto podrás registrar y consultar el historial de mantenimiento de los activos.
        </p>
      </div>
    </div>
  );
}
