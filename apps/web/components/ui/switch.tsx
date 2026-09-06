export interface SwitchProps {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
}: SwitchProps) {
  return (
    <label
      className={`inline-flex items-center gap-2.5 font-sans ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        onClick={() => !disabled && onChange?.(!checked)}
        className={`relative h-[21px] w-9 shrink-0 rounded-[var(--radius-full)] transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
          checked ? "bg-[var(--interactive-primary)]" : "bg-[var(--gray-300)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-[var(--gray-0)] shadow-[var(--shadow-xs)] transition-[left] duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
            checked ? "left-[17px]" : "left-[2px]"
          }`}
        />
      </span>
      {label && (
        <span className="text-[length:var(--text-base)] text-[var(--text-primary)]">
          {label}
        </span>
      )}
    </label>
  );
}
