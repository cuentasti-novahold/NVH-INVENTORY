'use client';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import type { TimeSeriesEntry } from '../../dto/analytics.dto';

const MOVEMENT_COLORS: Record<string, string> = {
  RELOCATION: 'var(--chart-1)',
  LOAN: 'var(--chart-2)',
  REPAIR: 'var(--chart-3)',
  RETURN_FROM_REPAIR: 'var(--chart-4)',
  AUDIT: 'var(--chart-5)',
};

const COLORS = Object.values(MOVEMENT_COLORS);

export function MovementsTimelineChart({ data }: { data: TimeSeriesEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos en los últimos 6 meses</p>;
  }

  const tipos = Object.keys(data[0] ?? {}).filter((k) => k !== 'month');
  const config = Object.fromEntries(
    tipos.map((t, i) => [t, { label: t, color: MOVEMENT_COLORS[t] ?? COLORS[i % COLORS.length] }]),
  );

  return (
    <ChartContainer config={config} className="h-[280px] w-full">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {tipos.map((tipo) => (
          <Bar
            key={tipo}
            dataKey={tipo}
            fill={`var(--color-${tipo})`}
            radius={[2, 2, 0, 0]}
            stackId="a"
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
