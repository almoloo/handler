import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Address } from 'viem';
import {
  handlerWalletAbi,
  trustReaderAbi,
  iIdentityRegistryAbi,
  iReputationRegistryAbi,
} from '@handler/contracts';
import { ChainService } from '../chain/chain.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrustTier, TrustSource } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

/** The minimal slice of an `Agent` row {@link TrustService.refreshTier} needs. */
export type TierAgent = {
  address: string;
  erc8004AgentId: bigint | null;
};

/** Fields to persist on the `Agent` row after a successful refresh — mirrors
 * `TrustReader.sol`'s `tierOf`/`_averageFeedback` exactly (see that file). */
export type TierRefreshed = {
  ok: true;
  trustTier: TrustTier;
  trustSource: typeof TrustSource.CHAIN;
  trustSummary: string;
  trustDetail: Prisma.InputJsonValue;
  attestationCount: number;
  trustCheckedAt: Date;
};

/** The registries were unreachable (RPC error or revert) — per backend-roadmap.md
 * §4.3, the caller must keep the agent's existing cached tier and only update the
 * summary, never fall back to FLAGGED on a transient failure. */
export type TierRefreshFailed = {
  ok: false;
  trustSummary: string;
};

export type TierRefreshResult = TierRefreshed | TierRefreshFailed;

/** Resolved on-chain trust config: the deployed registries and thresholds
 * `TrustReader.sol` itself reads from, fetched via `HandlerWallet.trustReader()`
 * -> `TrustReader.identityRegistry()`/`.reputationRegistry()`/the two threshold
 * constants -- never hand-copied, so this can't silently drift from the
 * contract (see contracts-roadmap.md §2.2). */
export type TrustConfig = {
  trustReaderAddress: Address;
  identityRegistryAddress: Address;
  reputationRegistryAddress: Address;
  verifiedMinScoreWad: bigint;
  verifiedMinFeedbackCount: bigint;
};

@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);
  private configPromise: Promise<TrustConfig> | null = null;

  constructor(
    private readonly chain: ChainService,
    private readonly prisma: PrismaService,
  ) {}

  /** Refreshes every `Agent` row's cached tier from the real registries, one at a
   * time. `@Interval` doesn't wait for the previous tick, but ticks don't overlap
   * in practice at this cadence against a handful of catalog agents; a slow tick
   * just delays the next one's start, matching the indexer's tolerance for that
   * (see indexer.service.ts). Wrapped per-agent in try/catch so one bad row can't
   * stop the rest from refreshing. */
  @Interval(60_000)
  async tick() {
    const agents = await this.prisma.agent.findMany({
      select: { id: true, address: true, erc8004AgentId: true },
    });

    for (const agent of agents) {
      try {
        const result = await this.refreshTier(agent);
        if (result.ok) {
          await this.prisma.agent.update({
            where: { id: agent.id },
            data: {
              trustTier: result.trustTier,
              trustSource: result.trustSource,
              trustSummary: result.trustSummary,
              trustDetail: result.trustDetail,
              attestationCount: result.attestationCount,
              trustCheckedAt: result.trustCheckedAt,
            },
          });
        } else {
          await this.prisma.agent.update({
            where: { id: agent.id },
            data: { trustSummary: result.trustSummary },
          });
        }
      } catch (error) {
        this.logger.error(
          `Trust refresh failed for agent ${agent.address}`,
          error,
        );
      }
    }
  }

  /** Resolves and caches {@link TrustConfig}. Concurrent callers before the
   * first resolution share the same in-flight promise; a failed resolution is
   * not cached, so the next call retries. */
  async getTrustConfig(): Promise<TrustConfig> {
    if (!this.configPromise) {
      this.configPromise = this.resolveTrustConfig().catch((error) => {
        this.configPromise = null;
        throw error;
      });
    }
    return this.configPromise;
  }

  private async resolveTrustConfig(): Promise<TrustConfig> {
    const trustReaderAddress = await this.chain.publicClient.readContract({
      address: this.chain.handlerWalletAddress,
      abi: handlerWalletAbi,
      functionName: 'trustReader',
    });

    const [
      identityRegistryAddress,
      reputationRegistryAddress,
      verifiedMinScoreWad,
      verifiedMinFeedbackCount,
    ] = await Promise.all([
      this.chain.publicClient.readContract({
        address: trustReaderAddress,
        abi: trustReaderAbi,
        functionName: 'identityRegistry',
      }),
      this.chain.publicClient.readContract({
        address: trustReaderAddress,
        abi: trustReaderAbi,
        functionName: 'reputationRegistry',
      }),
      this.chain.publicClient.readContract({
        address: trustReaderAddress,
        abi: trustReaderAbi,
        functionName: 'VERIFIED_MIN_SCORE_WAD',
      }),
      this.chain.publicClient.readContract({
        address: trustReaderAddress,
        abi: trustReaderAbi,
        functionName: 'VERIFIED_MIN_FEEDBACK_COUNT',
      }),
    ]);

    this.logger.log(`Resolved trust config: TrustReader ${trustReaderAddress}`);

    return {
      trustReaderAddress,
      identityRegistryAddress,
      reputationRegistryAddress,
      verifiedMinScoreWad,
      verifiedMinFeedbackCount,
    };
  }

  /** Resolves `agent`'s tier straight from the real registries — a TypeScript
   * port of `TrustReader.sol`'s `tierOf`/`_averageFeedback`, not a call to
   * `TrustReader.tierOf()` itself (that would only ever reflect its own
   * `syncAgent`-warmed cache; this reads live). Never throws: a registry
   * failure resolves to {@link TierRefreshFailed} so the caller can leave the
   * agent's existing cached tier untouched. */
  async refreshTier(agent: TierAgent): Promise<TierRefreshResult> {
    if (agent.erc8004AgentId === null) {
      return {
        ok: true,
        trustTier: TrustTier.FLAGGED,
        trustSource: TrustSource.CHAIN,
        trustSummary: 'Not verified',
        trustDetail: {},
        attestationCount: 0,
        trustCheckedAt: new Date(),
      };
    }

    let config: TrustConfig;
    try {
      config = await this.getTrustConfig();
    } catch (error) {
      this.logger.warn(`Couldn't resolve trust config: ${String(error)}`);
      return { ok: false, trustSummary: "Couldn't refresh trust" };
    }

    const agentId = agent.erc8004AgentId;

    try {
      const registryWallet = await this.chain.publicClient.readContract({
        address: config.identityRegistryAddress,
        abi: iIdentityRegistryAbi,
        functionName: 'getAgentWallet',
        args: [agentId],
      });

      if (registryWallet.toLowerCase() !== agent.address.toLowerCase()) {
        this.logger.warn(
          `Agent ${agent.address} claims agentId ${agentId} but the registry's current wallet for it is ${registryWallet} — flagging (stale mapping)`,
        );
        return {
          ok: true,
          trustTier: TrustTier.FLAGGED,
          trustSource: TrustSource.CHAIN,
          trustSummary: 'Not verified',
          trustDetail: { agentId: agentId.toString(), registryWallet },
          attestationCount: 0,
          trustCheckedAt: new Date(),
        };
      }

      const [, , values, valueDecimals] = await this.chain.publicClient.readContract({
        address: config.reputationRegistryAddress,
        abi: iReputationRegistryAbi,
        functionName: 'readAllFeedback',
        args: [agentId, [], '', '', false],
      });

      // valueDecimals is a uint8 the real, permissionless registry lets any caller set
      // per feedback entry (via giveFeedback) — an entry with decimals > 18 can't be
      // normalized to WAD (10n ** negative throws) and is excluded rather than letting
      // one hostile/malformed entry abort the whole average and freeze this agent's
      // cached tier on every future tick.
      const validEntries = values
        .map((value, i) => ({ value, decimals: valueDecimals[i] }))
        .filter((entry) => entry.decimals <= 18);
      const count = validEntries.length;
      const sumWad = validEntries.reduce(
        (sum, entry) => sum + entry.value * 10n ** BigInt(18 - entry.decimals),
        0n,
      );
      const averageWad = count > 0 ? sumWad / BigInt(count) : 0n;
      const isVerified =
        BigInt(count) >= config.verifiedMinFeedbackCount &&
        averageWad >= config.verifiedMinScoreWad;

      return {
        ok: true,
        trustTier: isVerified ? TrustTier.VERIFIED : TrustTier.NEW,
        trustSource: TrustSource.CHAIN,
        trustSummary: isVerified
          ? `Verified — ${count} rated jobs`
          : count > 0
            ? `New — ${count} rating${count === 1 ? '' : 's'} so far`
            : 'New — no ratings yet',
        trustDetail: {
          agentId: agentId.toString(),
          count,
          averageWad: averageWad.toString(),
        },
        attestationCount: count,
        trustCheckedAt: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `Couldn't refresh trust for agent ${agent.address} (agentId ${agentId}): ${String(error)}`,
      );
      return { ok: false, trustSummary: "Couldn't refresh trust" };
    }
  }
}
