'use client';

import { useState } from 'react';
import { BarChart2, Package, DollarSign, ClipboardList, ArrowRightLeft } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { InventarioTab } from './tabs/InventarioTab';
import { FinancieroTab } from './tabs/FinancieroTab';
import { AsignacionesTab } from './tabs/AsignacionesTab';
import { MovimientosTab } from './tabs/MovimientosTab';
import type { AnalyticsDashboardData } from '../dto/analytics.dto';

const TABS = [
  { value: 'inventario',   label: 'Inventario',   icon: Package,        accent: 'data-[state=active]:text-primary' },
  { value: 'financiero',   label: 'Financiero',   icon: DollarSign,     accent: 'data-[state=active]:text-accent' },
  { value: 'asignaciones', label: 'Asignaciones', icon: ClipboardList,  accent: 'data-[state=active]:text-primary' },
  { value: 'movimientos',  label: 'Movimientos',  icon: ArrowRightLeft, accent: 'data-[state=active]:text-accent' },
] as const;

export function AnalyticsDashboard({
  inventario,
  financiero,
  asignaciones,
  movimientos,
}: AnalyticsDashboardData) {
  const [tab, setTab] = useState<string>('inventario');

  return (
    <div className="flex min-h-full flex-col">
      {/* Page header */}
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BarChart2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none text-foreground">Analítica</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Panel ejecutivo de KPIs — inventario, finanzas, asignaciones y movimientos
            </p>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border bg-background">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList
            variant="line"
            className="h-auto w-full rounded-none bg-transparent px-6 pb-0 gap-0 justify-start"
          >
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  'flex items-center gap-2 rounded-none px-5 pb-3.5 pt-3 text-sm font-medium',
                  'after:bg-accent border-0',
                  'data-active:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab content */}
          <div className="px-6 py-6">
            <TabsContent value="inventario">
              <InventarioTab data={inventario} />
            </TabsContent>
            <TabsContent value="financiero">
              <FinancieroTab data={financiero} />
            </TabsContent>
            <TabsContent value="asignaciones">
              <AsignacionesTab data={asignaciones} />
            </TabsContent>
            <TabsContent value="movimientos">
              <MovimientosTab data={movimientos} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
