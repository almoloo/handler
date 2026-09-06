"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
}

export interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
}

export function Menu({ trigger, items = [], align = "right" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-50 min-w-45 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-1.5 font-sans shadow-[var(--shadow-md)] ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {items.map((item, i) => (
            <div
              key={i}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
              className={`cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-2 text-[length:var(--text-sm)] ${
                item.danger ? "text-[var(--status-error-fg)]" : "text-[var(--text-primary)]"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
