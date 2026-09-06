export interface FilterChipOption {
  label: string;
  value: string;
  status?: "approved" | "pending" | "blocked";
  count?: number;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  value: string;
  onChange?: (v: string) => void;
}

const DOT_CLASSES: Record<NonNullable<FilterChipOption["status"]>, string> = {
  approved: "bg-[var(--status-approved-fg)]",
  pending: "bg-[var(--status-pending-fg)]",
  blocked: "bg-[var(--status-blocked-fg)]",
};

export function FilterChips({ options = [], value, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 font-sans">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            className={`inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)] border px-3 text-[length:var(--text-sm)] font-[var(--weight-medium)] ${
              active
                ? "border-[var(--interactive-primary)] bg-[var(--brand-50)] text-[var(--interactive-primary)]"
                : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
            }`}
          >
            {option.status && (
              <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[option.status]}`} />
            )}
            {option.label}
            {typeof option.count === "number" && (
              <span className="opacity-60">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
