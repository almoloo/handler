import type { ReactNode } from "react";

export interface IconButtonProps {
  icon: ReactNode;
  size?: number;
  variant?: "ghost" | "outline";
  disabled?: boolean;
  onClick?: () => void;
  "aria-label": string;
}

const VARIANT_CLASSES: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  ghost:
    "bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
  outline:
    "bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
};

export function IconButton({
  icon,
  size = 36,
  variant = "ghost",
  disabled = false,
  onClick,
  "aria-label": ariaLabel,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ width: size, height: size }}
      className={`inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-[.4] ${VARIANT_CLASSES[variant]}`}
    >
      <span className="flex h-[18px] w-[18px]">{icon}</span>
    </button>
  );
}
