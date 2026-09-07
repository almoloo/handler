import { Avatar } from "./avatar";

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
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-1 py-3.5 font-sans">
      <Avatar name={avatarName || "?"} size={36} />
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
