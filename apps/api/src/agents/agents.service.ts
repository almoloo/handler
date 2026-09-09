import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { ChainService } from '../chain/chain.service.js';
import { parseChainEnv } from '../chain/chain.config.js';
import {
  hasActedThisEpoch,
  resolveHiredPolicy,
  submitAgentPayment,
} from '../chain/agent-payment.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentKind } from '../generated/prisma/enums.js';
import { parseAgentsEnv, type AgentsEnv } from './agents.config.js';

const RILEY_NAME = 'Riley';
const RILEY_DESCRIPTION = 'Pays the Subcontractor for completed work, once per day.';
const RILEY_KEY_ENV_VAR = 'RILEY_SESSION_KEY';

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

  /** Riley's configured per-run payment size (wei). Exposed so the `/demo`
   * director's workday beat submits the same amount the cron does, rather
   * than parsing `RILEY_PAYMENT_WEI` a second time. */
  get paymentWei(): bigint {
    return this.env.RILEY_PAYMENT_WEI;
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
   * on-chain epoch window. Thin wrapper over the shared
   * {@link hasActedThisEpoch} — see `agent-payment.ts` for the epoch rule
   * itself (must stay identical to `PoliciesService.spentTodayUsd`'s). */
  private alreadyPaidThisEpoch(
    policy: RileyPolicy,
    rileyAgentId: string,
    subcontractorAddress: Address,
  ): Promise<boolean> {
    return hasActedThisEpoch({
      prisma: this.prisma,
      policy,
      agentId: rileyAgentId,
      target: subcontractorAddress,
    });
  }

  /** Riley's on-demand entry point for the `/demo` director: pays the
   * Subcontractor once, for one wallet, at a caller-chosen amount.
   *
   * Two deliberate differences from the cron path, neither of which touches
   * the chain: it acts on a single wallet instead of every wallet that hired
   * Riley, and it skips {@link hasActedThisEpoch}. That guard is a backend
   * dedupe convenience, not a policy check — `tryExecute` re-runs every real
   * trust/cap/allowance check on this call exactly as it does for the cron —
   * and without the skip, two beats paying the same counterparty in one epoch
   * would silently no-op. `valueWei` is what makes the over-the-co-sign-cap
   * beat differ from the workday beat: the wallet's own `PriceConverter`
   * values it, and `cosignAboveUsd` decides whether it executes or queues. */
  async payWalletForDemo(params: {
    walletAddress: string;
    valueWei: bigint;
    demoRunId: string;
  }): Promise<void> {
    const subcontractorAddress = await this.subcontractorAddress();
    const policy = await resolveHiredPolicy({
      prisma: this.prisma,
      agentAddress: this.rileyAddress,
      agentName: RILEY_NAME,
      walletAddress: params.walletAddress,
    });

    await submitAgentPayment({
      prisma: this.prisma,
      chain: this.chain,
      account: this.rileyAccount,
      walletClient: this.rileyWalletClient,
      walletAddress: params.walletAddress as Address,
      policyId: policy.id,
      agentId: policy.agentId,
      target: subcontractorAddress,
      valueWei: params.valueWei,
      demoRunId: params.demoRunId,
    });
  }

  /** Pays the Subcontractor for one wallet, once per epoch. Thin wrapper
   * over the shared {@link submitAgentPayment} — see `agent-payment.ts` for
   * the Intent-row-first / submit-throw / reverted-receipt handling shared
   * with `VillainService`'s blocked-payment attempt. */
  private async payWallet(
    policy: RileyPolicy,
    rileyAgentId: string,
    subcontractorAddress: Address,
  ): Promise<void> {
    if (await this.alreadyPaidThisEpoch(policy, rileyAgentId, subcontractorAddress)) {
      return;
    }

    await submitAgentPayment({
      prisma: this.prisma,
      chain: this.chain,
      account: this.rileyAccount,
      walletClient: this.rileyWalletClient,
      walletAddress: policy.walletAddress as Address,
      policyId: policy.id,
      agentId: rileyAgentId,
      target: subcontractorAddress,
      valueWei: this.env.RILEY_PAYMENT_WEI,
    });
  }
}
