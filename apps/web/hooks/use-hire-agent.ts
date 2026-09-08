"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { handlerWalletAbi } from "@/lib/contracts";

/** Tier enum from `ITrustReader.sol` — never `FLAGGED` from this flow (see
 * current-feature.md's load-bearing decision on the "verified only" toggle). */
const Tier = { FLAGGED: 0, NEW: 1, VERIFIED: 2 } as const;

export interface HirePolicyDraft {
  sessionKey: `0x${string}`;
  dailyCapUsd: bigint;
  perTxCapUsd: bigint;
  cosignAboveUsd: bigint;
  allowSwaps: boolean;
  allowUnknownContracts: boolean;
  /** Owner-facing "pay other agents: verified only" toggle. */
  verifiedOnly: boolean;
}

/**
 * Wraps the owner-signed `hireAgent(sessionKey, policy)` write — the first
 * owner-signed on-chain write from apps/web, and the pattern freeze/approve/deny
 * reuse later. Targets whichever `HandlerWallet` address the caller passes in
 * (the owner's factory-resolved wallet, created fresh via `use-create-wallet.ts`
 * if this is their first hire — see `app/app/hire/page.tsx`). `epochStart`,
 * `spentThisEpoch`, and `frozen` are sent as zero/false: the contract
 * overwrites all three on `hireAgent` regardless of what's passed.
 */
export function useHireAgent() {
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const hire = useCallback(
    async (walletAddress: Address, draft: HirePolicyDraft) => {
      return writeContractAsync({
        address: walletAddress,
        abi: handlerWalletAbi,
        functionName: "hireAgent",
        args: [
          draft.sessionKey,
          {
            dailyCapUsd: draft.dailyCapUsd,
            perTxCapUsd: draft.perTxCapUsd,
            cosignAboveUsd: draft.cosignAboveUsd,
            epochStart: BigInt(0),
            spentThisEpoch: BigInt(0),
            minCounterpartyTier: draft.verifiedOnly ? Tier.VERIFIED : Tier.NEW,
            allowSwaps: draft.allowSwaps,
            allowUnknownContracts: draft.allowUnknownContracts,
            frozen: false,
          },
        ],
      });
    },
    [writeContractAsync],
  );

  return {
    hire,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
