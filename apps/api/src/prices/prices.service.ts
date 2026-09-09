import { Injectable, Logger } from '@nestjs/common';
import { aggregatorV3InterfaceAbi } from '@handler/contracts';
import { ChainService } from '../chain/chain.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PRICE_CACHE_TTL_MS,
  resolvePriceFeeds,
  type FeedConfig,
  type PriceSymbol,
} from './prices.config.js';

const USD_DECIMALS = 8;

/** One symbol's answer from `GET /prices`. `priceUsd` is a USD-8 fixed-point
 * string (never a `bigint`/`number` — see current-feature.md's "Notes for the
 * AI"), `null` only when no chain read has ever succeeded for this symbol. */
export interface PriceQuote {
  priceUsd: string | null;
  feedUpdatedAt: string | null;
  stale: boolean;
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly chain: ChainService,
    private readonly prisma: PrismaService,
  ) {}

  async getPrices(): Promise<Record<PriceSymbol, PriceQuote>> {
    let feeds: Record<PriceSymbol, FeedConfig>;
    try {
      feeds = resolvePriceFeeds(this.chain.chainId);
    } catch (error) {
      // An unconfigured CHAIN_ID (e.g. a stray Base Sepolia deployment — see
      // chain.config.ts, which does resolve a real address for it) must not
      // turn this public, unauthenticated route into a 500 on every request;
      // it degrades the same way a failed chain read does.
      this.logger.warn(`Couldn't resolve price feeds: ${String(error)}`);
      const unavailable: PriceQuote = { priceUsd: null, feedUpdatedAt: null, stale: true };
      return { ETH: unavailable, USDC: unavailable };
    }
    const symbols = Object.keys(feeds) as PriceSymbol[];
    const entries = await Promise.all(
      symbols.map(
        async (symbol) => [symbol, await this.getPrice(symbol, feeds[symbol])] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<PriceSymbol, PriceQuote>;
  }

  private async getPrice(symbol: PriceSymbol, feed: FeedConfig): Promise<PriceQuote> {
    const cached = await this.prisma.priceSnapshot.findFirst({
      where: { symbol },
      orderBy: { fetchedAt: 'desc' },
    });

    if (cached && Date.now() - cached.fetchedAt.getTime() < PRICE_CACHE_TTL_MS) {
      return this.toQuote(cached.priceUsd, cached.feedUpdatedAt, feed);
    }

    try {
      const [decimals, roundData] = await Promise.all([
        this.chain.publicClient.readContract({
          address: feed.feedAddress,
          abi: aggregatorV3InterfaceAbi,
          functionName: 'decimals',
        }),
        this.chain.publicClient.readContract({
          address: feed.feedAddress,
          abi: aggregatorV3InterfaceAbi,
          functionName: 'latestRoundData',
        }),
      ]);
      const [roundId, answer, , updatedAt] = roundData;
      if (answer <= 0n) {
        throw new Error(`Feed returned a non-positive answer: ${answer}`);
      }

      const priceUsd = normalizeToUsd8(answer, decimals);
      const feedUpdatedAt = new Date(Number(updatedAt) * 1000);

      await this.prisma.priceSnapshot.upsert({
        where: { feedAddress_roundId: { feedAddress: feed.feedAddress, roundId } },
        create: {
          symbol,
          feedAddress: feed.feedAddress,
          roundId,
          priceUsd,
          feedUpdatedAt,
        },
        update: {},
      });

      return this.toQuote(priceUsd, feedUpdatedAt, feed);
    } catch (error) {
      this.logger.warn(`Couldn't read ${symbol} feed: ${String(error)}`);
      if (!cached) {
        return { priceUsd: null, feedUpdatedAt: null, stale: true };
      }
      // A stale-but-present cached row from a prior successful read — surfaced
      // rather than a fabricated fresh one, per current-feature.md's "no
      // hardcoded rate fallback" rule.
      return { ...this.toQuote(cached.priceUsd, cached.feedUpdatedAt, feed), stale: true };
    }
  }

  private toQuote(priceUsd: bigint, feedUpdatedAt: Date, feed: FeedConfig): PriceQuote {
    const ageSeconds = (Date.now() - feedUpdatedAt.getTime()) / 1000;
    return {
      priceUsd: priceUsd.toString(),
      feedUpdatedAt: feedUpdatedAt.toISOString(),
      stale: ageSeconds > feed.maxStalenessSeconds,
    };
  }
}

/** Mirrors `PriceConverter.sol`'s `_normalizeToUsd8`: scale the feed's raw
 * answer to USD-8 fixed point regardless of the feed's own decimals. */
function normalizeToUsd8(answer: bigint, feedDecimals: number): bigint {
  if (feedDecimals === USD_DECIMALS) return answer;
  if (feedDecimals > USD_DECIMALS) {
    return answer / 10n ** BigInt(feedDecimals - USD_DECIMALS);
  }
  return answer * 10n ** BigInt(USD_DECIMALS - feedDecimals);
}
