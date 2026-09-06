export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  formatValue?: (value: number, max: number) => string;
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  formatValue,
}: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const fmt = formatValue ?? ((v: number, m: number) => `${v} / ${m}`);

  return (
    <div className="flex flex-col gap-1.5 font-sans">
      {label && (
        <div className="flex justify-between text-[length:var(--text-sm)]">
          <span className="text-[var(--text-secondary)]">{label}</span>
          <span className="font-[var(--weight-medium)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
            {fmt(value, max)}
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-[var(--gray-100)]">
        <div
          className={`h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
            pct >= 100 ? "bg-[var(--status-blocked-icon)]" : "bg-[var(--interactive-primary)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
