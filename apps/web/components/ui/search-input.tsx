export interface SearchInputProps {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
}: SearchInputProps) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 font-sans">
      <svg
        viewBox="0 0 24 24"
        width={15}
        height={15}
        fill="none"
        stroke="var(--text-tertiary)"
        strokeWidth={2}
      >
        <circle cx={11} cy={11} r={7} />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="flex-1 border-none bg-transparent font-sans text-[length:var(--text-base)] text-[var(--text-primary)] outline-none"
      />
    </div>
  );
}
