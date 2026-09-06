export interface RadioProps {
  label?: string;
  checked?: boolean;
  onChange?: () => void;
  /** Accepted for canvas-contract parity; not read internally — grouping is the parent's job via checked/onChange. */
  name?: string;
  disabled?: boolean;
}

export function Radio({ label, checked = false, onChange, disabled = false }: RadioProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 font-sans ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        onClick={() => !disabled && onChange?.()}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border bg-[var(--surface-card)] ${
          checked ? "border-[var(--interactive-primary)]" : "border-[var(--border-strong)]"
        }`}
      >
        {checked && (
          <span className="h-[9px] w-[9px] rounded-full bg-[var(--interactive-primary)]" />
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
