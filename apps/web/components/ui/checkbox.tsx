export interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
}: CheckboxProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 font-sans ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        onClick={() => !disabled && onChange?.(!checked)}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--radius-xs)] border transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
          checked
            ? "border-[var(--interactive-primary)] bg-[var(--interactive-primary)]"
            : "border-[var(--border-strong)] bg-[var(--surface-card)]"
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 16 16"
            width={11}
            height={11}
            fill="none"
            stroke="var(--gray-0)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
      </span>
      {label && (
        <span className="text-[length:var(--text-base)] text-[var(--text-primary)]">
          {label}
        </span>
      )}
    </label>
  );
}
