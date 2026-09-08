"use client";

import { useCallback, useMemo } from "react";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { decodeEventLog, type Address } from "viem";
import { handlerWalletFactoryAbi, resolveFactoryAddress } from "@/lib/contracts";

/**
 * Wraps the owner-signed `createWallet(owner)` write against
 * `HandlerWalletFactory` — same shape as `use-hire-agent.ts`'s hook, and the
 * first leg of the hire flow's two-step confirm when the owner has no
 * `HandlerWallet` yet (`use-wallet-address.ts` resolves `null`).
 * `createWallet` is permissionless (anyone can call it for any `owner`), but
 * this hook always signs with the connected account — the owner creates
 * their own wallet, never a backend signer.
 */
export function useCreateWallet() {
  const chainId = useChainId();
  const { writeContractAsync, data: hash, isPending, error: writeError } =
    useWriteContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const createWallet = useCallback(
    async (owner: Address) => {
      const address = resolveFactoryAddress(chainId);
      return writeContractAsync({
        address,
        abi: handlerWalletFactoryAbi,
        functionName: "createWallet",
        args: [owner],
      });
    },
    [chainId, writeContractAsync],
  );

  /** The newly created wallet's address, decoded from the confirmed
   * receipt's `WalletCreated` log rather than a follow-up read. */
  const walletAddress = useMemo<Address | null>(() => {
    if (!receipt || receipt.status !== "success") return null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: handlerWalletFactoryAbi,
          eventName: "WalletCreated",
          data: log.data,
          topics: log.topics,
        });
        return decoded.args.wallet;
      } catch {
        continue;
      }
    }
    return null;
  }, [receipt]);

  return {
    createWallet,
    walletAddress,
    isPending: isPending || isConfirming,
    isSuccess: receipt?.status === "success",
    isReverted: receipt?.status === "reverted",
    error: writeError ?? receiptError,
  };
}
