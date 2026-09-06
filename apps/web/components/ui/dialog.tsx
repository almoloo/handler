"use client";

import type { ReactNode } from "react";
import {
  Dialog as HeadlessDialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";

export interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
}

export function Dialog({ open, title, children, onClose, footer }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={() => onClose?.()} className="relative z-100">
      <DialogBackdrop className="fixed inset-0 bg-[var(--gray-950)]/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-105 max-w-[90%] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] font-sans shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4.5">
            <DialogTitle className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              {title}
            </DialogTitle>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer border-none bg-transparent text-[length:var(--text-md)] text-[var(--text-tertiary)]"
              >
                ×
              </button>
            )}
          </div>
          <div className="p-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-5 py-4">
              {footer}
            </div>
          )}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
