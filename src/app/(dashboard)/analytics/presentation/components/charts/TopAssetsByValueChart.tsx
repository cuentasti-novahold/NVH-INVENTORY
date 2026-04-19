'use client';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartEntry } from '../../dto/analytics.dto';

const chartConfig = {
  value: { label: 'Valor (COP)', color: 'var(--chart-1)' },
};

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}

export function TopAssetsByValueChart({ data }: { data: ChartEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[320px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCOP(v as number)} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCOP(v as number)} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
