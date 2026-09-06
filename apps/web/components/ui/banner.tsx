import type { ReactNode } from "react";

export interface BannerProps {
  status?: "approved" | "pending" | "blocked" | "error" | "neutral";
  onDismiss?: () => void;
  children?: ReactNode;
}

const STATUS_CLASSES: Record<NonNullable<BannerProps["status"]>, string> = {
  approved:
    "bg-[var(--status-approved-bg)] border-[var(--status-approved-border)] text-[var(--status-approved-fg)]",
  pending:
    "bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--status-pending-fg)]",
  blocked:
    "bg-[var(--status-blocked-bg)] border-[var(--status-blocked-border)] text-[var(--status-blocked-fg)]",
  error:
    "bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-fg)]",
  neutral: "bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)]",
};

export function Banner({ status = "neutral", onDismiss, children }: BannerProps) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 font-sans text-[length:var(--text-sm)] ${STATUS_CLASSES[status]}`}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="border-none bg-transparent text-[length:var(--text-md)] leading-none text-inherit opacity-70 cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}
