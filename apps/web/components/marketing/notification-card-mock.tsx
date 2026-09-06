const VARIANT_STYLES = {
  approved: {
    wrapper:
      "bg-[var(--status-approved-bg)] border border-[var(--status-approved-border)]",
    icon: "var(--status-approved-icon)",
    title: "text-[var(--status-approved-fg)]",
  },
  blocked: {
    wrapper:
      "bg-[var(--status-blocked-bg)] border border-[var(--status-blocked-border)]",
    icon: "var(--status-blocked-icon)",
    title: "text-[var(--status-blocked-fg)]",
  },
} as const;

export interface NotificationCardMockProps {
  variant: "approved" | "blocked";
  title: string;
  subtitle: string;
  className?: string;
}

export function NotificationCardMock({
  variant,
  title,
  subtitle,
  className = "",
}: NotificationCardMockProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3.5 shadow-[var(--shadow-md)] md:gap-4 md:px-5 md:py-4 ${styles.wrapper} ${className}`}
    >
      {variant === "approved" ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={styles.icon}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M4 12l5 5L20 6" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={styles.icon}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M5.5 5.5l13 13" />
        </svg>
      )}
      <div>
        <div
          className={`text-[length:var(--text-sm)] font-[var(--weight-semibold)] md:text-[length:var(--text-base)] ${styles.title}`}
        >
          {title}
        </div>
        <div className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] md:text-[length:var(--text-sm)]">
          {subtitle}
        </div>
      </div>
    </div>
  );
}
