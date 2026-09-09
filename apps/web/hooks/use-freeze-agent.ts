"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { handlerWalletAbi } from "@/lib/contracts";
import { useWalletAddress } from "@/hooks/use-wallet-address";

/**
 * Wraps the owner-signed `freezeAgent(sessionKey)` / `unfreezeAgent(sessionKey)`
 * writes against `HandlerWallet` — a one-tap, plain wagmi write (no Ledger
 * device needed; freezing is a deliberate control action, not the co-sign
 * moment — frontend-roadmap §2). Exact pattern-copy of `use-deny-approval.ts`,
 * parameterized by the target `frozen` state to pick which of the two
 * same-shaped functions to call.
 *
 * Targets the connected owner's own factory-created wallet
 * (`useWalletAddress()`), not a static config address, matching every other
 * write hook in this app.
 */
export function useFreezeAgent() {
  const { walletAddress } = useWalletAddress();
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const setFrozen = useCallback(
    async (sessionKey: Address, frozen: boolean) => {
      if (!walletAddress) {
        throw new Error("Wallet not found");
      }
      return writeContractAsync({
        address: walletAddress,
        abi: handlerWalletAbi,
        functionName: frozen ? "freezeAgent" : "unfreezeAgent",
        args: [sessionKey],
      });
    },
    [walletAddress, writeContractAsync],
  );

  return {
    setFrozen,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
