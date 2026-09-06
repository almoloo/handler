export interface ListRowProps {
  avatarName: string;
  title: string;
  subtitle?: string;
  amount?: string;
  status?: "approved" | "pending" | "blocked" | "error";
  time?: string;
}

const STATUS_DOT_CLASSES: Record<NonNullable<ListRowProps["status"]>, string> = {
  approved: "bg-[var(--status-approved-fg)]",
  pending: "bg-[var(--status-pending-fg)]",
  blocked: "bg-[var(--status-blocked-fg)]",
  error: "bg-[var(--status-error-fg)]",
};

export function ListRow({ avatarName, title, subtitle, amount, status, time }: ListRowProps) {
  const initials = (avatarName || "?")
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-1 py-3.5 font-sans">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-500)] text-[length:var(--text-sm)] font-[var(--weight-semibold)] text-[var(--gray-0)]">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-base)] font-[var(--weight-medium)] text-[var(--text-primary)]">
          {title}
        </div>
        <div className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">{subtitle}</div>
      </div>
      <div className="shrink-0 text-right">
        {amount && (
          <div className="text-[length:var(--text-base)] font-[var(--weight-semibold)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
            {amount}
          </div>
        )}
        {time && (
          <div className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">{time}</div>
        )}
      </div>
      {status && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status] ?? "bg-[var(--gray-400)]"}`}
        />
      )}
    </div>
  );
}
