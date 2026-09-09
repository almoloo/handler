"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { handlerWalletAbi } from "@/lib/contracts";
import { useWalletAddress } from "@/hooks/use-wallet-address";

/**
 * Wraps the owner-signed `deny(id)` write against `HandlerWallet` — a
 * one-tap, plain wagmi write (no Ledger device needed; deny is not the
 * co-sign moment). Exact pattern-copy of `use-hire-agent.ts`.
 *
 * Targets the connected owner's own factory-created wallet
 * (`useWalletAddress()`), not a static config address — a `PendingApproval`
 * only exists for a wallet this session owns (`ApprovalsService.findForWallet`
 * 404s otherwise), so this resolution always matches the approval being denied.
 */
export function useDenyApproval() {
  const { walletAddress } = useWalletAddress();
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const deny = useCallback(
    async (id: `0x${string}`) => {
      if (!walletAddress) {
        throw new Error("Wallet not found");
      }
      return writeContractAsync({
        address: walletAddress,
        abi: handlerWalletAbi,
        functionName: "deny",
        args: [id],
      });
    },
    [walletAddress, writeContractAsync],
  );

  return {
    deny,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
