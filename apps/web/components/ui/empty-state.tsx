import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-12 px-5 text-center font-sans">
      <div className="mb-4 h-10 w-10 rounded-full border border-[var(--border-default)] bg-[var(--surface-sunken)]" />
      <div className="mb-1 text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
        {title}
      </div>
      {message && (
        <div
          className={`max-w-xs text-[length:var(--text-base)] text-[var(--text-tertiary)] ${
            action ? "mb-4" : "mb-0"
          }`}
        >
          {message}
        </div>
      )}
      {action}
    </div>
  );
}
