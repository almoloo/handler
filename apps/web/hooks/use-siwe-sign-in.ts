"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SiweMessage } from "siwe";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { fetchNonce, verifySiwe } from "@/lib/api";
import { sessionQueryKey } from "./use-session";

/** Nonce -> sign -> verify, then makes the session query see the new session.
 * Requires a wallet already connected via wagmi. isPending/error cover the
 * whole flow (nonce fetch, signature, verification), not just the signature
 * step, so a rejected signature and a backend-rejected verify both surface. */
export function useSiweSignIn() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!address) {
        throw new Error("Connect a wallet before signing in");
      }
      const { nonce } = await fetchNonce(address);
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();
      const signature = await signMessageAsync({ message });
      await verifySiwe(message, signature);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });

  return {
    signIn: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
