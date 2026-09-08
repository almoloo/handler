"use client";

import { useCallback } from "react";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { handlerWalletAbi, resolveHandlerWalletAddress } from "@/lib/contracts";

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
 * Wraps the owner-signed `hireAgent(sessionKey, policy)` write against the
 * dev `HandlerWallet` — the first owner-signed on-chain write from apps/web,
 * and the pattern freeze/approve/deny reuse later. `epochStart`,
 * `spentThisEpoch`, and `frozen` are sent as zero/false: the contract
 * overwrites all three on `hireAgent` regardless of what's passed.
 */
export function useHireAgent() {
  const chainId = useChainId();
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const hire = useCallback(
    async (draft: HirePolicyDraft) => {
      const address = resolveHandlerWalletAddress(chainId);
      return writeContractAsync({
        address,
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
    [chainId, writeContractAsync],
  );

  return {
    hire,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
