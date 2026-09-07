"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useConnectionEffect } from "wagmi";
import { logout, type SessionResponse } from "@/lib/api";
import { sessionQueryKey } from "./use-session";

/** Keeps the session in sync with the connected wallet: disconnecting or
 * switching to a different account ends the session (rather than leaving
 * the previous account's session active) and re-prompts sign-in. */
export function useSyncSessionWithWallet() {
  const queryClient = useQueryClient();

  function endSessionIfActive(newAddress?: string) {
    const session = queryClient.getQueryData<SessionResponse | null>(
      sessionQueryKey,
    );
    if (!session) return;
    if (newAddress && session.address.toLowerCase() === newAddress.toLowerCase()) {
      return;
    }
    logout()
      .catch(() => {})
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      });
  }

  useConnectionEffect({
    onDisconnect: () => endSessionIfActive(),
    onConnect: ({ address }) => endSessionIfActive(address),
  });
}
