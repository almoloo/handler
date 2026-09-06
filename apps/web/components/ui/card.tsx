import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  padding?: number;
  children?: ReactNode;
}

export function Card({ title, subtitle, children, padding = 20 }: CardProps) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] font-sans shadow-[var(--shadow-sm)]"
      style={{ padding }}
    >
      {(title || subtitle) && (
        <div className="mb-3.5">
          {title && (
            <div className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="mt-0.5 text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
              {subtitle}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
