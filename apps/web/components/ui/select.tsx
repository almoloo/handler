export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}

export function Select({
  label,
  value,
  onChange,
  options = [],
  disabled = false,
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5 font-sans">
      {label && (
        <label className="text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-primary)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-[38px] w-full cursor-pointer appearance-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] py-0 pl-3 pr-8 font-sans text-[length:var(--text-base)] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          ▾
        </span>
      </div>
    </div>
  );
}
