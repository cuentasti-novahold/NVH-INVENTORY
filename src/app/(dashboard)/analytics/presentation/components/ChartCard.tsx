import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  fullBleed?: boolean;
}

export function ChartCard({
  title,
  description,
  children,
  className,
  contentClassName,
  fullBleed = false,
}: ChartCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <div className="px-6 py-4 border-b border-border/60 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn(fullBleed ? 'p-0' : 'px-6 py-5', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
