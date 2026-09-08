"use client";

import { useCallback } from "react";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { handlerWalletAbi, resolveHandlerWalletAddress } from "@/lib/contracts";

/**
 * Wraps the owner-signed `deny(id)` write against `HandlerWallet` — a
 * one-tap, plain wagmi write (no Ledger device needed; deny is not the
 * co-sign moment). Exact pattern-copy of `use-hire-agent.ts`.
 */
export function useDenyApproval() {
  const chainId = useChainId();
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const deny = useCallback(
    async (id: `0x${string}`) => {
      const address = resolveHandlerWalletAddress(chainId);
      return writeContractAsync({
        address,
        abi: handlerWalletAbi,
        functionName: "deny",
        args: [id],
      });
    },
    [chainId, writeContractAsync],
  );

  return {
    deny,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
