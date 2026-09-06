import type { ReactNode } from "react";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  onClick?: () => void;
  type?: "button" | "submit";
  children?: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 gap-1.5 px-3 text-[var(--text-sm)]",
  md: "h-[38px] gap-2 px-4 text-[var(--text-base)]",
  lg: "h-11 gap-2 px-5 text-[var(--text-md)]",
};

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--interactive-primary)] text-[var(--interactive-primary-fg)] border-[var(--interactive-primary)] hover:bg-[var(--interactive-primary-hover)]",
  secondary:
    "bg-[var(--interactive-secondary)] text-[var(--text-primary)] border-[var(--interactive-secondary-border)] hover:bg-[var(--surface-sunken)]",
  ghost:
    "bg-transparent text-[var(--text-primary)] border-transparent hover:bg-[var(--surface-sunken)]",
  danger:
    "bg-[var(--surface-card)] text-[var(--status-error-fg)] border-[var(--status-error-border)]",
};

export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  icon,
  iconPosition = "left",
  onClick,
  type = "button",
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border font-sans font-[var(--weight-medium)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-[.45] ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
    >
      {icon && iconPosition === "left" && <span className="flex h-4 w-4">{icon}</span>}
      {children}
      {icon && iconPosition === "right" && <span className="flex h-4 w-4">{icon}</span>}
    </button>
  );
}
