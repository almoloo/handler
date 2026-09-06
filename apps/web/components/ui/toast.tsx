export interface ToastProps {
  status?: "approved" | "pending" | "blocked" | "error" | "neutral";
  title: string;
  message?: string;
  onClose?: () => void;
}

const STATUS_DOT_CLASSES: Record<NonNullable<ToastProps["status"]>, string> = {
  approved: "bg-[var(--status-approved-icon)]",
  pending: "bg-[var(--status-pending-icon)]",
  blocked: "bg-[var(--status-blocked-icon)]",
  error: "bg-[var(--status-error-icon)]",
  neutral: "bg-[var(--gray-500)]",
};

export function Toast({ status = "neutral", title, message, onClose }: ToastProps) {
  return (
    <div className="flex w-85 items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-3.5 font-sans shadow-[var(--shadow-lg)]">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
      <div className="flex-1">
        <div className="text-[length:var(--text-sm)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
          {title}
        </div>
        {message && (
          <div className="mt-0.5 text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            {message}
          </div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer border-none bg-transparent text-[length:var(--text-md)] leading-none text-[var(--text-tertiary)]"
        >
          ×
        </button>
      )}
    </div>
  );
}
