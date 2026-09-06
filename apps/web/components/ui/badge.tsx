import type { ReactNode } from "react";

export interface BadgeProps {
  status?: "approved" | "pending" | "blocked" | "error" | "neutral";
  dot?: boolean;
  children?: ReactNode;
}

const STATUS_STYLES: Record<
  NonNullable<BadgeProps["status"]>,
  { container: string; dot: string }
> = {
  approved: {
    container:
      "bg-[var(--status-approved-bg)] border-[var(--status-approved-border)] text-[var(--status-approved-fg)]",
    dot: "bg-[var(--status-approved-icon)]",
  },
  pending: {
    container:
      "bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--status-pending-fg)]",
    dot: "bg-[var(--status-pending-icon)]",
  },
  blocked: {
    container:
      "bg-[var(--status-blocked-bg)] border-[var(--status-blocked-border)] text-[var(--status-blocked-fg)]",
    dot: "bg-[var(--status-blocked-icon)]",
  },
  error: {
    container:
      "bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-fg)]",
    dot: "bg-[var(--status-error-icon)]",
  },
  neutral: {
    container:
      "bg-[var(--gray-50)] border-[var(--border-default)] text-[var(--text-secondary)]",
    dot: "bg-[var(--gray-500)]",
  },
};

export function Badge({ status = "neutral", dot = true, children }: BadgeProps) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[var(--text-xs)] font-[var(--weight-medium)] leading-none ${styles.container}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />}
      {children}
    </span>
  );
}
