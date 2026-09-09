import { describe, expect, it, vi } from 'vitest';
import { PricesService } from './prices.service.js';

type ReadContractArgs = { address: string; functionName: string };

function makeService(opts: {
  findFirst?: (args: { where: { symbol: string } }) => unknown;
  readContract?: (args: ReadContractArgs) => unknown;
  upsert?: (args: unknown) => unknown;
}) {
  const readContract = vi.fn(
    opts.readContract ??
      (async () => {
        throw new Error('unexpected readContract call');
      }),
  );
  const findFirst = vi.fn(opts.findFirst ?? (async () => null));
  const upsert = vi.fn(opts.upsert ?? (async () => ({})));

  const chain = { chainId: 8453, publicClient: { readContract } };
  const prisma = { priceSnapshot: { findFirst, upsert } };

  const service = new PricesService(chain as never, prisma as never);
  return { service, readContract, findFirst, upsert };
}

describe('PricesService.getPrices', () => {
  it('returns a fresh cached row without reading the chain', async () => {
    const now = Date.now();
    const { service, readContract } = makeService({
      findFirst: async ({ where }) => ({
        symbol: where.symbol,
        priceUsd: 300000000000n,
        feedUpdatedAt: new Date(now - 1_000),
        fetchedAt: new Date(now - 1_000), // well within the 30s TTL
      }),
    });

    const result = await service.getPrices();

    expect(readContract).not.toHaveBeenCalled();
    expect(result.ETH.priceUsd).toBe('300000000000');
    expect(result.ETH.stale).toBe(false);
    expect(result.USDC.priceUsd).toBe('300000000000');
  });

  it('reads the chain and persists a snapshot when the cache is expired', async () => {
    const { service, readContract, upsert } = makeService({
      findFirst: async () => null, // no cache at all — forces a read
      readContract: async ({ functionName }) => {
        if (functionName === 'decimals') return 8;
        if (functionName === 'latestRoundData') {
          return [1n, 300000000000n, 0n, BigInt(Math.floor(Date.now() / 1000)), 1n];
        }
        throw new Error(`unexpected ${functionName}`);
      },
    });

    const result = await service.getPrices();

    expect(readContract).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    const [upsertArgs] = upsert.mock.calls[0] as [
      { create: { priceUsd: bigint }; where: { feedAddress_roundId: { roundId: bigint } } },
    ];
    expect(upsertArgs.create.priceUsd).toBe(300000000000n);
    expect(upsertArgs.where.feedAddress_roundId.roundId).toBe(1n);
    expect(result.ETH.priceUsd).toBe('300000000000');
    expect(result.ETH.stale).toBe(false);
  });

  it('falls back to the cached row, marked stale, when the chain read throws', async () => {
    const now = Date.now();
    const { service } = makeService({
      findFirst: async () => ({
        priceUsd: 250000000000n,
        feedUpdatedAt: new Date(now - 1_000),
        fetchedAt: new Date(now - 60_000), // expired — forces a read attempt
      }),
      readContract: async () => {
        throw new Error('rpc down');
      },
    });

    const result = await service.getPrices();

    expect(result.ETH.priceUsd).toBe('250000000000');
    expect(result.ETH.stale).toBe(true);
  });

  it('returns priceUsd: null, stale: true when the chain read throws with no cached row', async () => {
    const { service } = makeService({
      findFirst: async () => null,
      readContract: async () => {
        throw new Error('rpc down');
      },
    });

    const result = await service.getPrices();

    expect(result.ETH.priceUsd).toBeNull();
    expect(result.ETH.feedUpdatedAt).toBeNull();
    expect(result.ETH.stale).toBe(true);
  });

  it('degrades to an unavailable quote for both symbols rather than throwing, when the chain id has no configured feeds', async () => {
    const chain = { chainId: 999999, publicClient: { readContract: vi.fn() } };
    const prisma = { priceSnapshot: { findFirst: vi.fn(), upsert: vi.fn() } };
    const service = new PricesService(chain as never, prisma as never);

    const result = await service.getPrices();

    expect(result.ETH).toEqual({ priceUsd: null, feedUpdatedAt: null, stale: true });
    expect(result.USDC).toEqual({ priceUsd: null, feedUpdatedAt: null, stale: true });
    expect(prisma.priceSnapshot.findFirst).not.toHaveBeenCalled();
  });
});
