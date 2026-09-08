import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { ChainService } from '../chain/chain.service.js';
import { parseChainEnv } from '../chain/chain.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AgentKind,
  ExecutionKind,
  IntentStatus,
} from '../generated/prisma/enums.js';
import { parseAgentsEnv, type AgentsEnv } from './agents.config.js';

const RILEY_NAME = 'Riley';
const RILEY_DESCRIPTION = 'Pays the Subcontractor for completed work, once per day.';
const RILEY_KEY_ENV_VAR = 'RILEY_SESSION_KEY';

/** Mirrors `HandlerWallet`'s lazy 24h epoch roll (see `_rollEpoch` in the
 * contract and `PoliciesService.spentTodayUsd`) — must stay identical to
 * both or "spent today" and "already paid today" silently disagree. */
const EPOCH_SECONDS = 86_400n;

/** A minimal slice of a `Policy` row {@link AgentsService.run} needs. */
type RileyPolicy = {
  id: string;
  walletAddress: string;
  epochStart: bigint;
};

/**
 * Holds Riley's own session-key signer (never the owner's key) and self-registers
 * Riley's real catalog identity. Frozen session interface (backend-roadmap day 3):
 * every catalog agent owns its own signer and calls `tryExecute` directly against
 * `HandlerWallet` — see agents.module.ts. Riley's live action ({@link run}) pays
 * the real Subcontractor counterparty once per epoch for every wallet that hired
 * it, cron-driven — not gated behind any demo trigger. It's also the key the
 * Ledger Key Ring secret-custody story (backend-roadmap §4.2) is built around.
 */
@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private readonly env: AgentsEnv;
  private readonly rileyAccount: PrivateKeyAccount;
  readonly rileyWalletClient: ReturnType<typeof createWalletClient>;
  // @Interval is a plain setInterval — it does not wait for the previous tick() to
  // resolve. payWallet() awaits a real tx submit + receipt per wallet, which can
  // outlast the 60s period, so without this guard an overlapping tick could pass
  // alreadyPaidThisEpoch() for the same wallet twice and double-pay the
  // Subcontractor. Same pattern as IndexerService's `running` guard.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {
    this.env = parseAgentsEnv();
    this.rileyAccount = privateKeyToAccount(
      this.env.RILEY_SESSION_KEY as `0x${string}`,
    );
    this.rileyWalletClient = createWalletClient({
      account: this.rileyAccount,
      transport: http(parseChainEnv().CHAIN_RPC_URL),
    });
  }

  get rileyAddress(): Address {
    return this.rileyAccount.address;
  }

  /** Resolves the real Subcontractor counterparty's address — the exact
   * `Agent` row `scripts/register-agents.ts` creates (real ERC-8004
   * registration, not a fixture). Throws rather than falling back to a
   * hardcoded address if the registry setup script hasn't been run yet
   * against this chain. */
  async subcontractorAddress(): Promise<Address> {
    const subcontractor = await this.prisma.agent.findFirst({
      where: { kind: AgentKind.COUNTERPARTY, name: 'Subcontractor' },
    });
    if (!subcontractor) {
      throw new Error(
        'Subcontractor agent not found — run `pnpm --filter api register-agents` (scripts/register-agents.ts) against this chain first.',
      );
    }
    return subcontractor.address as Address;
  }

  /** Resolves the session's `HandlerWallet` address from the owner's SIWE
   * address, or `null` if this owner hasn't hired anyone yet (no `Wallet` row).
   * One `HandlerWallet` per owner (backend-roadmap.md §3). */
  async walletAddressForOwner(ownerAddress: string): Promise<string | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { owner: ownerAddress },
    });
    return wallet?.address ?? null;
  }

  async onModuleInit() {
    const address = this.rileyAddress.toLowerCase();
    await this.prisma.agent.upsert({
      where: { address },
      update: {
        name: RILEY_NAME,
        description: RILEY_DESCRIPTION,
        kind: AgentKind.HIRED,
        keyEnvVar: RILEY_KEY_ENV_VAR,
      },
      create: {
        address,
        name: RILEY_NAME,
        description: RILEY_DESCRIPTION,
        kind: AgentKind.HIRED,
        keyEnvVar: RILEY_KEY_ENV_VAR,
      },
    });
    this.logger.log(`Riley session key: ${this.rileyAddress}`);
  }

  /** Cron entry point, matching `TrustService`'s `@Interval(60_000)` cadence
   * — {@link run} itself already no-ops per wallet once that wallet is paid
   * for the epoch, so a 60s tick just means "check again soon", not "pay
   * again soon". Guarded against overlap (see `running` above) since a slow
   * tick submitting real payments must never race a second one. */
  @Interval(60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } finally {
      this.running = false;
    }
  }

  /** Riley's live action: pays the real Subcontractor once per 24h epoch for
   * every wallet that has hired Riley and hasn't frozen it. Cron-driven (see
   * {@link tick}), not gated behind `/demo` — runs for any wallet, not just
   * a showcase one. Wrapped per-wallet in try/catch so one bad wallet can't
   * stop the rest, matching `TrustService.tick()`. */
  async run(): Promise<void> {
    let subcontractorAddress: Address;
    try {
      subcontractorAddress = await this.subcontractorAddress();
    } catch (error) {
      this.logger.warn(`Riley run skipped: ${String(error)}`);
      return;
    }

    const rileyAgent = await this.prisma.agent.findUnique({
      where: { address: this.rileyAddress.toLowerCase() },
    });
    if (!rileyAgent) return;

    const policies = await this.prisma.policy.findMany({
      where: { agentId: rileyAgent.id, frozen: false },
      select: { id: true, walletAddress: true, epochStart: true },
    });

    for (const policy of policies) {
      try {
        await this.payWallet(policy, rileyAgent.id, subcontractorAddress);
      } catch (error) {
        this.logger.error(
          `Riley run failed for wallet ${policy.walletAddress}`,
          error,
        );
      }
    }
  }

  /** Whether Riley has already planned/submitted/confirmed a payment to
   * `subcontractorAddress` for this wallet within the wallet's current
   * on-chain epoch window — mirrors `PoliciesService.spentTodayUsd`'s
   * `now > epochStart + 86_400` rule so this never drifts from what the UI
   * reports as "spent today". A prior `FAILED` attempt doesn't count, so a
   * failed run is retried on the next tick instead of being skipped for the
   * rest of the epoch. */
  private async alreadyPaidThisEpoch(
    policy: RileyPolicy,
    rileyAgentId: string,
    subcontractorAddress: Address,
  ): Promise<boolean> {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (nowSeconds > policy.epochStart + EPOCH_SECONDS) {
      return false;
    }
    const existing = await this.prisma.intent.findFirst({
      where: {
        walletAddress: policy.walletAddress,
        agentId: rileyAgentId,
        target: subcontractorAddress.toLowerCase(),
        createdAt: { gte: new Date(Number(policy.epochStart) * 1000) },
        status: { not: IntentStatus.FAILED },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Writes the `Intent` row before submitting the tx (backend-roadmap §4.2's
   * "intent row first" rule), then calls `tryExecute` via Riley's own
   * session-key signer. A submit-time throw (no tx hash yet, e.g. an RPC
   * error or a simulated revert) marks the `Intent` `FAILED` directly. A
   * successfully broadcast tx that still reverts on-chain (e.g. the wallet's
   * own ETH balance can't cover the transfer) emits no `Executed`/
   * `ExecutionBlocked` log for the indexer to link back to this `Intent`, so
   * this method also awaits the receipt and marks it `FAILED` on a reverted
   * status rather than leaving it stuck at `SUBMITTED` forever. */
  private async payWallet(
    policy: RileyPolicy,
    rileyAgentId: string,
    subcontractorAddress: Address,
  ): Promise<void> {
    if (await this.alreadyPaidThisEpoch(policy, rileyAgentId, subcontractorAddress)) {
      return;
    }

    const intent = await this.prisma.intent.create({
      data: {
        walletAddress: policy.walletAddress,
        policyId: policy.id,
        agentId: rileyAgentId,
        kind: ExecutionKind.AGENT_PAYMENT,
        target: subcontractorAddress.toLowerCase(),
        valueRaw: this.env.RILEY_PAYMENT_WEI.toString(),
        calldata: '0x',
        status: IntentStatus.PLANNED,
      },
    });

    let txHash: Hex;
    try {
      txHash = await this.rileyWalletClient.writeContract({
        chain: null,
        account: this.rileyAccount,
        address: policy.walletAddress as Address,
        abi: this.chain.handlerWalletAbi,
        functionName: 'tryExecute',
        args: [{ target: subcontractorAddress, data: '0x', value: this.env.RILEY_PAYMENT_WEI }],
      });
    } catch (error) {
      await this.prisma.intent.update({
        where: { id: intent.id },
        data: { status: IntentStatus.FAILED, error: String(error) },
      });
      return;
    }

    await this.prisma.intent.update({
      where: { id: intent.id },
      data: { status: IntentStatus.SUBMITTED, txHash, submittedAt: new Date() },
    });

    const receipt = await this.chain.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    if (receipt.status === 'reverted') {
      await this.prisma.intent.update({
        where: { id: intent.id },
        data: { status: IntentStatus.FAILED, error: 'Transaction reverted on-chain' },
      });
    }
  }
}
