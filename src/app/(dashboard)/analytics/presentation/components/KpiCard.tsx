import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiVariant = 'primary' | 'accent' | 'success' | 'warning' | 'neutral';

interface KpiCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon?: LucideIcon;
  variant?: KpiVariant;
  description?: string;
  className?: string;
}

const variantMap: Record<KpiVariant, { bar: string; icon: string }> = {
  primary: { bar: 'bg-primary', icon: 'bg-primary/10 text-primary' },
  accent:  { bar: 'bg-accent',  icon: 'bg-accent/10 text-accent' },
  success: { bar: 'bg-emerald-500', icon: 'bg-emerald-500/10 text-emerald-600' },
  warning: { bar: 'bg-amber-500',   icon: 'bg-amber-500/10 text-amber-600' },
  neutral: { bar: 'bg-border',      icon: 'bg-muted text-muted-foreground' },
};

export function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  variant = 'primary',
  description,
  className,
}: KpiCardProps) {
  const styles = variantMap[variant];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card flex flex-col gap-0 transition-shadow hover:shadow-md',
        className,
      )}
    >
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', styles.bar)} />

      <div className="pl-5 pr-5 pt-5 pb-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground leading-none">
            {label}
          </p>
          {Icon && (
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', styles.icon)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
        </div>

        <p className="text-[2rem] font-bold tracking-tight text-foreground tabular-nums leading-none">
          {value}
          {suffix && (
            <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span>
          )}
        </p>

        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
