import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  label,
}: {
  value: number | null;
  className?: string;
  label: string;
}) {
  const known = value !== null && Number.isFinite(value);
  const pct = known ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(pct) : undefined}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-300",
          !known && "w-1/3 animate-pulse",
        )}
        style={known ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
