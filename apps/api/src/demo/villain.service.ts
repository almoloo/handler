import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { ChainService } from '../chain/chain.service.js';
import { parseChainEnv } from '../chain/chain.config.js';
import { hasActedThisEpoch, submitAgentPayment } from '../chain/agent-payment.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentKind } from '../generated/prisma/enums.js';
import { parseVillainEnv, type VillainEnv } from './villain.config.js';

const VILLAIN_NAME = 'Villain';
const VILLAIN_DESCRIPTION =
  'An adversarial test actor — attempts payments to unverified counterparties.';
const VILLAIN_KEY_ENV_VAR = 'VILLAIN_SESSION_KEY';

/** A minimal slice of a `Policy` row {@link VillainService.run} needs. */
type VillainPolicy = {
  id: string;
  walletAddress: string;
  epochStart: bigint;
};

/**
 * Holds the villain's own session-key signer (never the owner's key) and
 * self-registers its `Agent` row (`kind: VILLAIN`). Per backend-roadmap.md
 * §4.2, the villain "lives in `demo/`, not `agents/` — an adversarial test
 * actor, not a product agent": it's deliberately excluded from
 * `GET /agents/catalog` (`AgentKind.HIRED` only), so hiring it requires the
 * owner-signed `hireAgent()` tx any wallet can make, using the address
 * logged on boot — no special script, no backend-held owner key.
 */
@Injectable()
export class VillainService implements OnModuleInit {
  private readonly logger = new Logger(VillainService.name);
  private readonly env: VillainEnv;
  private readonly villainAccount: PrivateKeyAccount;
  readonly villainWalletClient: ReturnType<typeof createWalletClient>;
  // @Interval is a plain setInterval — it does not wait for the previous tick() to
  // resolve. payWallet() awaits a real tx submit + receipt per wallet, which can
  // outlast the 60s period, so without this guard an overlapping tick could pass
  // hasActedThisEpoch() for the same wallet twice and double-submit the attempt.
  // Same pattern as AgentsService.tick()/IndexerService's `running` guard.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {
    this.env = parseVillainEnv();
    this.villainAccount = privateKeyToAccount(
      this.env.VILLAIN_SESSION_KEY as `0x${string}`,
    );
    this.villainWalletClient = createWalletClient({
      account: this.villainAccount,
      transport: http(parseChainEnv().CHAIN_RPC_URL),
    });
  }

  get villainAddress(): Address {
    return this.villainAccount.address;
  }

  async onModuleInit() {
    const address = this.villainAddress.toLowerCase();
    await this.prisma.agent.upsert({
      where: { address },
      update: {
        name: VILLAIN_NAME,
        description: VILLAIN_DESCRIPTION,
        kind: AgentKind.VILLAIN,
        keyEnvVar: VILLAIN_KEY_ENV_VAR,
      },
      create: {
        address,
        name: VILLAIN_NAME,
        description: VILLAIN_DESCRIPTION,
        kind: AgentKind.VILLAIN,
        keyEnvVar: VILLAIN_KEY_ENV_VAR,
      },
    });
    this.logger.log(`Villain session key: ${this.villainAddress}`);
  }

  /** Cron entry point, matching `AgentsService.tick()`'s `@Interval(60_000)`
   * cadence and `running`-guarded reentrancy protection — a slow tick
   * submitting a real tx must never race a second one. */
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

  /** The villain's live action: attempts one payment per 24h epoch to
   * `VILLAIN_TARGET_ADDRESS` for every wallet that has hired it and hasn't
   * frozen it. Cron-driven (see {@link tick}), not gated behind `/demo` —
   * the villain's existence and action are real product code; only the
   * (not-yet-built) operator trigger endpoints are demo-gated. Wrapped
   * per-wallet in try/catch so one bad wallet can't stop the rest, matching
   * `AgentsService.run()`. */
  async run(): Promise<void> {
    const villainAgent = await this.prisma.agent.findUnique({
      where: { address: this.villainAddress.toLowerCase() },
    });
    if (!villainAgent) return;

    const policies = await this.prisma.policy.findMany({
      where: { agentId: villainAgent.id, frozen: false },
      select: { id: true, walletAddress: true, epochStart: true },
    });

    for (const policy of policies) {
      try {
        await this.payWallet(policy, villainAgent.id);
      } catch (error) {
        this.logger.error(
          `Villain run failed for wallet ${policy.walletAddress}`,
          error,
        );
      }
    }
  }

  /** Attempts the villain's payment for one wallet, once per epoch. The
   * contract's own checks decide whether it executes or blocks — this just
   * submits the same shape of call `AgentsService.payWallet` does, via the
   * shared {@link hasActedThisEpoch}/{@link submitAgentPayment}. */
  private async payWallet(
    policy: VillainPolicy,
    villainAgentId: string,
  ): Promise<void> {
    const target = this.env.VILLAIN_TARGET_ADDRESS as Address;
    if (
      await hasActedThisEpoch({
        prisma: this.prisma,
        policy,
        agentId: villainAgentId,
        target,
      })
    ) {
      return;
    }

    await submitAgentPayment({
      prisma: this.prisma,
      chain: this.chain,
      account: this.villainAccount,
      walletClient: this.villainWalletClient,
      walletAddress: policy.walletAddress as Address,
      policyId: policy.id,
      agentId: villainAgentId,
      target,
      valueWei: this.env.VILLAIN_PAYMENT_WEI,
    });
  }
}
