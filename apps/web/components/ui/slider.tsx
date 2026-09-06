export interface SliderProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (v: number) => void;
  /** Formats the live value shown at top-right, e.g. v => `$${v}` */
  formatValue?: (v: number) => string;
}

export function Slider({
  label,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  formatValue,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const fmt: (v: number) => string | number = formatValue ?? ((v) => v);

  return (
    <div className="flex flex-col gap-2 font-sans">
      <div className="flex items-baseline justify-between">
        {label ? (
          <span className="text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-primary)]">
            {label}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[length:var(--text-base)] font-[var(--weight-semibold)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
          {fmt(value)}
        </span>
      </div>
      <div className="relative flex h-5 items-center">
        <div className="absolute inset-x-0 h-1 rounded-[var(--radius-full)] bg-[var(--gray-200)]" />
        <div
          className="absolute left-0 h-1 rounded-[var(--radius-full)] bg-[var(--interactive-primary)]"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="relative m-0 w-full bg-transparent accent-[var(--interactive-primary)]"
        />
      </div>
    </div>
  );
}
