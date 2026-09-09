import { isAddress, type Address } from 'viem';

/** The two symbols this module prices — see current-feature.md's "Out of
 * scope": no `Token` table, no arbitrary-token support, just what the
 * roadmap asks for. */
export type PriceSymbol = 'ETH' | 'USDC';

export interface FeedConfig {
  /** address(0) for native ETH, matching `IPriceConverter`'s convention. */
  tokenAddress: Address;
  feedAddress: Address;
  /** The token's native decimals — 18 for ETH, 6 for Base's native USDC. */
  tokenDecimals: number;
  /** Seconds a round may be old before this symbol is reported `stale`. */
  maxStalenessSeconds: number;
}

/**
 * Feed addresses and staleness windows, copied from
 * `packages/contracts/script/DeployConfig.sol` — the same constants the real,
 * deployed `PriceConverter` on each chain was configured with (see
 * current-feature.md's "Decisions already made"). `31337` (anvil) forks Base
 * mainnet, so its addresses are identical to `8453`'s, not separately chosen.
 */
const PRICE_FEEDS: Record<number, Record<PriceSymbol, FeedConfig>> = {
  8453: {
    ETH: {
      tokenAddress: '0x0000000000000000000000000000000000000000',
      feedAddress: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
      tokenDecimals: 18,
      maxStalenessSeconds: 60 * 60, // 1 hour
    },
    USDC: {
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      feedAddress: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
      tokenDecimals: 6,
      maxStalenessSeconds: 26 * 60 * 60, // 26 hours
    },
  },
};
PRICE_FEEDS[31337] = PRICE_FEEDS[8453];

/** How long a cached `PriceSnapshot` row is served without a fresh chain
 * read. Re-checked as a plain read every call — no lock/refresh-ahead, matching
 * this module's low expected request volume. */
export const PRICE_CACHE_TTL_MS = 30_000;

/** Looks up the configured feeds for a chain id, matching
 * `chain.config.ts#resolveHandlerWalletAddress`'s fail-fast shape: an
 * unconfigured chain throws rather than silently serving nothing. */
export function resolvePriceFeeds(
  chainId: number,
): Record<PriceSymbol, FeedConfig> {
  const config = PRICE_FEEDS[chainId];
  if (!config) {
    throw new Error(`No price feeds configured for chain ${chainId}`);
  }
  for (const symbol of Object.keys(config) as PriceSymbol[]) {
    const feed = config[symbol];
    if (!isAddress(feed.feedAddress)) {
      throw new Error(
        `Configured ${symbol} feed address for chain ${chainId} is not a valid address: ${feed.feedAddress}`,
      );
    }
  }
  return config;
}
