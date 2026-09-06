import type { ReactNode } from "react";

export interface NavItemProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export function NavItem({ label, icon, active = false, onClick, badge }: NavItemProps) {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] py-2.25 px-2.5 font-sans text-[length:var(--text-base)] font-[var(--weight-medium)] ${
        active ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
      }`}
    >
      {icon && <span className="flex h-4.5 w-4.5 shrink-0">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded-[var(--radius-full)] bg-[var(--brand-600)] py-px px-1.75 text-[length:var(--text-2xs)] font-[var(--weight-semibold)] text-[var(--text-inverse)]">
          {badge}
        </span>
      )}
    </div>
  );
}
