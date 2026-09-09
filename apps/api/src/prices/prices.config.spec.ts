import { describe, expect, it } from 'vitest';
import { PRICE_CACHE_TTL_MS, resolvePriceFeeds } from './prices.config.js';

describe('resolvePriceFeeds', () => {
  it('resolves ETH and USDC feeds for chain 8453 (Base mainnet)', () => {
    const feeds = resolvePriceFeeds(8453);
    expect(feeds.ETH.feedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(feeds.ETH.tokenDecimals).toBe(18);
    expect(feeds.ETH.maxStalenessSeconds).toBe(60 * 60);
    expect(feeds.USDC.feedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(feeds.USDC.tokenDecimals).toBe(6);
    expect(feeds.USDC.maxStalenessSeconds).toBe(26 * 60 * 60);
  });

  it('resolves the same feeds for chain 31337 (anvil, forks Base mainnet)', () => {
    expect(resolvePriceFeeds(31337)).toEqual(resolvePriceFeeds(8453));
  });

  it('throws for an unconfigured chain id', () => {
    expect(() => resolvePriceFeeds(999999)).toThrow(
      /No price feeds configured/,
    );
  });
});

describe('PRICE_CACHE_TTL_MS', () => {
  it('is 30 seconds, per backend-roadmap §4.4', () => {
    expect(PRICE_CACHE_TTL_MS).toBe(30_000);
  });
});
