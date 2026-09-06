export interface TrustIndicatorProps {
  level?: "new" | "building" | "established";
  size?: "sm" | "md";
}

const LEVEL_CONFIG: Record<
  NonNullable<TrustIndicatorProps["level"]>,
  { label: string; dots: number; colorClass: string }
> = {
  new: { label: "New", dots: 1, colorClass: "bg-[var(--slate-500)]" },
  building: { label: "Building trust", dots: 2, colorClass: "bg-[var(--amber-600)]" },
  established: { label: "Established", dots: 3, colorClass: "bg-[var(--green-600)]" },
};

const SIZE_CLASSES: Record<NonNullable<TrustIndicatorProps["size"]>, string> = {
  sm: "text-[length:var(--text-xs)]",
  md: "text-[length:var(--text-sm)]",
};

export function TrustIndicator({ level = "established", size = "md" }: TrustIndicatorProps) {
  const cfg = LEVEL_CONFIG[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans text-[var(--text-secondary)] ${SIZE_CLASSES[size]}`}
    >
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.25 w-1.25 rounded-full ${i < cfg.dots ? cfg.colorClass : "bg-[var(--gray-200)]"}`}
          />
        ))}
      </span>
      {cfg.label}
    </span>
  );
}
