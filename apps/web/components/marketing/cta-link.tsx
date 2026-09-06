import Link from "next/link";
import type { ReactNode } from "react";

export interface CtaLinkProps {
  href: string;
  size?: "sm" | "lg";
  children: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<CtaLinkProps["size"]>, string> = {
  sm: "h-9 px-4 text-[length:var(--text-sm)] md:h-11 md:px-5 md:text-[length:var(--text-base)]",
  lg: "h-11 px-5.5 text-[length:var(--text-base)] md:h-12 md:px-6.5 md:text-[length:var(--text-md)]",
};

export function CtaLink({ href, size = "sm", children }: CtaLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-[var(--radius-md)] bg-[var(--interactive-primary)] font-[var(--weight-semibold)] text-[var(--interactive-primary-fg)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-[var(--interactive-primary-hover)] ${SIZE_CLASSES[size]}`}
    >
      {children}
    </Link>
  );
}
