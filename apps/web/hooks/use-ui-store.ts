"use client";

import { create } from "zustand";

export interface ToastEntry {
  id: string;
  status: "approved" | "pending" | "blocked" | "error";
  title: string;
  message?: string;
}

interface UiStore {
  toasts: ToastEntry[];
  pushToast: (toast: Omit<ToastEntry, "id">) => void;
  dismissToast: (id: string) => void;
}

/** How long a toast stays visible before auto-dismissing itself. Scheduled
 * once per toast at push time (below) — not re-derived from the current
 * toast list on every render — so an unrelated toast arriving or leaving
 * doesn't reset an already-running countdown. */
const AUTO_DISMISS_MS = 6_000;

/**
 * The one Zustand UI-state store frontend-roadmap.md §1 calls for ("Zustand
 * (one store: UI state — sign-in gate, toasts, filters)"). Only the
 * toast-queue slice this feature needs is added here; sign-in-gate/filter
 * state stays where it already lives (`use-session`, local component
 * state) rather than being pulled in as an unrelated refactor.
 */
export const useUiStore = create<UiStore>((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), AUTO_DISMISS_MS);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
