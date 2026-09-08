import { addresses } from "@handler/contracts/addresses";
import { handlerWalletAbi, handlerWalletFactoryAbi } from "@handler/contracts";
import { isAddress, type Address } from "viem";

export { handlerWalletAbi, handlerWalletFactoryAbi };

/**
 * The dev `HandlerWallet` address for a chain id, per `@handler/contracts/addresses`.
 * Mirrors `apps/api/src/chain/chain.config.ts`'s `resolveHandlerWalletAddress` — no
 * shared lib between the two apps, so this is hand-kept in sync.
 */
export function resolveHandlerWalletAddress(chainId: number): Address {
  const config = (addresses as Record<number, { handlerWallet: string }>)[
    chainId
  ];
  if (!config) {
    throw new Error(`No HandlerWallet address configured for chain ${chainId}`);
  }
  if (!isAddress(config.handlerWallet)) {
    throw new Error(
      `Configured HandlerWallet address for chain ${chainId} is not a valid address: ${config.handlerWallet}`,
    );
  }
  return config.handlerWallet;
}

/**
 * The `HandlerWalletFactory` address for a chain id, per
 * `@handler/contracts/addresses`. Same shape as `resolveHandlerWalletAddress`.
 */
export function resolveFactoryAddress(chainId: number): Address {
  const config = (addresses as Record<number, { factory: string }>)[chainId];
  if (!config) {
    throw new Error(`No HandlerWalletFactory address configured for chain ${chainId}`);
  }
  if (!isAddress(config.factory)) {
    throw new Error(
      `Configured HandlerWalletFactory address for chain ${chainId} is not a valid address: ${config.factory}`,
    );
  }
  return config.factory;
}
