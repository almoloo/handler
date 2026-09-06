"use client";

import { useState, type ReactNode } from "react";

export interface TooltipProps {
  label: string;
  children: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--gray-900)] px-2.5 py-1.5 text-[length:var(--text-xs)] whitespace-nowrap text-[var(--gray-0)] shadow-[var(--shadow-md)]">
          {label}
        </span>
      )}
    </span>
  );
}
