'use client';

import { Pie, PieChart, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import type { ChartEntry } from '../../dto/analytics.dto';

const COLORS = ['var(--chart-2)', 'var(--chart-3)'];

export function AssignmentsPieChart({ data }: { data: ChartEntry[] }) {
  if (data.every((d) => d.value === 0)) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin activos registrados</p>;
  }

  const config = Object.fromEntries(
    data.map((d, i) => [d.label, { label: d.label, color: COLORS[i % COLORS.length] }]),
  );

  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[260px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={50}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
