export interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["deltaTone"]>, string> = {
  positive: "text-[var(--status-approved-fg)]",
  negative: "text-[var(--status-blocked-fg)]",
  neutral: "text-[var(--text-tertiary)]",
};

export function StatCard({ label, value, delta, deltaTone = "neutral" }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4.5 font-sans shadow-[var(--shadow-sm)]">
      <div className="mb-1.5 text-[length:var(--text-sm)] text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
        {value}
      </div>
      {delta && (
        <div className={`mt-1 text-[length:var(--text-xs)] ${TONE_CLASSES[deltaTone]}`}>
          {delta}
        </div>
      )}
    </div>
  );
}
