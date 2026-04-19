'use client';

import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import type { TimeSeriesEntry } from '../../dto/analytics.dto';

const chartConfig = {
  valorLibro: { label: 'Valor Libro', color: 'var(--chart-2)' },
  depreciacionAcumulada: { label: 'Depreciación Acum.', color: 'var(--chart-1)' },
};

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}

export function DepreciationAreaChart({ data }: { data: TimeSeriesEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin snapshots de depreciación</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCOP(v as number)} width={90} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => formatCOP(v as number)} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="depreciacionAcumulada"
          fill="var(--color-depreciacionAcumulada)"
          stroke="var(--color-depreciacionAcumulada)"
          fillOpacity={0.3}
          stackId="a"
        />
        <Area
          type="monotone"
          dataKey="valorLibro"
          fill="var(--color-valorLibro)"
          stroke="var(--color-valorLibro)"
          fillOpacity={0.4}
          stackId="a"
        />
      </AreaChart>
    </ChartContainer>
  );
}
