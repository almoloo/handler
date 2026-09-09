"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Where the operator's pasted DEMO_TOKEN lives, in their browser only. */
const STORAGE_KEY = "handler.demoToken";

let listeners: Array<() => void> = [];
/** Mirrors localStorage so getSnapshot() returns a stable reference between
 * writes — re-reading storage on every render would loop useSyncExternalStore. */
let cached: string | null = null;

function readStorage(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Storage blocked (private window, hardened browser). The operator retypes
    // the token this session; everything else still works.
    return "";
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
  };
}

function getSnapshot(): string {
  if (cached === null) {
    cached = readStorage();
  }
  return cached;
}

/** The server has no storage, so it always renders an empty field and the
 * real value arrives on hydration — which is exactly what
 * useSyncExternalStore's two-snapshot contract is for. */
function getServerSnapshot(): string {
  return "";
}

function writeToken(value: string): void {
  cached = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Losing persistence is survivable; losing the screen isn't.
  }
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Holds the director's `x-demo-token` for this browser.
 *
 * The token is deliberately not a `NEXT_PUBLIC_` var: that would compile it
 * into the JS bundle any visitor can read, and the backend's second factor
 * would collapse to SIWE ownership alone. Pasting it once per recording device
 * keeps it a real secret.
 */
export function useDemoToken() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setToken = useCallback((value: string) => writeToken(value), []);
  return { token, setToken };
}
