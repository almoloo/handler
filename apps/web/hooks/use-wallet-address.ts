"use client";

import { useAccount, useChainId, useReadContract } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { handlerWalletFactoryAbi, resolveFactoryAddress } from "@/lib/contracts";

/**
 * The connected owner's `HandlerWallet` address, resolved on-chain via
 * `HandlerWalletFactory.walletOf(owner)` — the source of truth for whether
 * this owner has a wallet yet at all, per `use-hire-agent.ts`'s new
 * factory-routed flow. `walletAddress` is `null` both while still loading
 * and when the owner has no wallet yet (the factory returns the zero
 * address for both) — callers that need to tell those apart should also
 * check `isLoading`.
 */
export function useWalletAddress() {
  const { address: owner } = useAccount();
  const chainId = useChainId();

  let factoryAddress: Address | null = null;
  try {
    factoryAddress = resolveFactoryAddress(chainId);
  } catch {
    // Unsupported chain (e.g. not yet configured for this network) — the
    // read stays disabled below rather than throwing during render.
  }

  const { data, isLoading, error } = useReadContract({
    address: factoryAddress ?? undefined,
    abi: handlerWalletFactoryAbi,
    functionName: "walletOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(owner && factoryAddress) },
  });

  const walletAddress: Address | null =
    data && data !== zeroAddress ? data : null;

  return { walletAddress, isLoading, error };
}
