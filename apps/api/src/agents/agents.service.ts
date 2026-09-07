import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createWalletClient, http, parseEventLogs, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { ChainService } from '../chain/chain.service.js';
import { parseChainEnv } from '../chain/chain.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentKind, ExecutionKind, IntentStatus } from '../generated/prisma/enums.js';
import { parseAgentsEnv, type AgentsEnv } from './agents.config.js';
import { OneInchService } from './oneinch.service.js';

const RILEY_NAME = 'Riley';
const RILEY_DESCRIPTION =
  'Rebalances idle balance into a stablecoin through 1inch.';
const RILEY_KEY_ENV_VAR = 'RILEY_SESSION_KEY';

/**
 * Holds Riley's own session-key signer (never the owner's key) and self-registers
 * Riley's real catalog identity. Frozen session interface (backend-roadmap day 3):
 * every catalog agent owns its own signer and calls `tryExecute` directly against
 * `HandlerWallet` — see agents.module.ts.
 */
@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private readonly env: AgentsEnv;
  private readonly rileyAccount: PrivateKeyAccount;
  readonly rileyWalletClient: ReturnType<typeof createWalletClient>;
  /** Runs currently in flight, keyed by `${walletAddress}:${sessionKey}` — guards
   * against a double "run now" (double-click, retry) submitting two real swaps for
   * the same wallet/agent pair concurrently. Per-process only; fine for the single
   * API instance this hackathon runs. */
  private readonly runsInFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly oneInch: OneInchService,
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

  /**
   * Owner-triggered "run now": Riley plans a fixed ETH -> configured-token swap via
   * 1inch and submits it through `ownerAddress`'s wallet as its own session key,
   * signed and sent directly against `HandlerWallet.tryExecute` — the frozen session
   * interface (see agents.module.ts). `agentId` must resolve to Riley; any other
   * agent has no run capability yet (subcontractor/villain land in a later feature).
   */
  async run(ownerAddress: string, agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent || agent.address !== this.rileyAddress.toLowerCase()) {
      throw new NotFoundException('Agent has no run capability');
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: { owner: ownerAddress },
    });
    if (!wallet) {
      throw new NotFoundException('No wallet for this session');
    }

    const policy = await this.prisma.policy.findUnique({
      where: {
        walletAddress_sessionKey: {
          walletAddress: wallet.address,
          sessionKey: agent.address,
        },
      },
    });
    if (!policy) {
      throw new NotFoundException('Riley is not hired for this wallet');
    }
    if (policy.frozen) {
      throw new ConflictException('Riley is frozen for this wallet');
    }

    const runKey = `${wallet.address}:${agent.address}`;
    if (this.runsInFlight.has(runKey)) {
      throw new ConflictException('A run is already in progress for this agent');
    }
    this.runsInFlight.add(runKey);

    try {
      return await this.executeRun(wallet.address, policy.id, agent.id);
    } finally {
      this.runsInFlight.delete(runKey);
    }
  }

  private async executeRun(walletAddress: string, policyId: string, agentId: string) {
    let quote;
    try {
      quote = await this.oneInch.getSwapQuote(walletAddress as Address);
    } catch (error) {
      this.logger.error('1inch swap quote failed', error as Error);
      throw new BadGatewayException('Failed to get a 1inch swap quote');
    }

    const intent = await this.prisma.intent.create({
      data: {
        walletAddress,
        policyId,
        agentId,
        kind: ExecutionKind.SWAP,
        target: quote.to.toLowerCase(),
        calldata: quote.data,
        valueRaw: quote.value.toString(),
        tokenAddress: this.env.RILEY_SWAP_TOKEN_OUT.toLowerCase(),
        meta: {
          oneInchQuote: quote.raw as object,
          tokenIn: 'ETH',
          tokenOut: this.env.RILEY_SWAP_TOKEN_OUT,
        },
        status: IntentStatus.PLANNED,
      },
    });

    let txHash: `0x${string}`;
    try {
      txHash = await this.rileyWalletClient.writeContract({
        chain: null,
        account: this.rileyAccount,
        address: this.chain.handlerWalletAddress,
        abi: this.chain.handlerWalletAbi,
        functionName: 'tryExecute',
        args: [{ target: quote.to, data: quote.data, value: quote.value }],
      });
    } catch (error) {
      this.logger.error('Riley swap submission failed', error as Error);
      await this.prisma.intent.update({
        where: { id: intent.id },
        data: { status: IntentStatus.FAILED, error: (error as Error).message },
      });
      throw new BadGatewayException('Failed to submit the swap transaction');
    }

    await this.prisma.intent.update({
      where: { id: intent.id },
      data: { status: IntentStatus.SUBMITTED, txHash, submittedAt: new Date() },
    });

    let receipt;
    try {
      receipt = await this.chain.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
    } catch (error) {
      // The tx was genuinely submitted (txHash is real) — an RPC flake or timeout here
      // doesn't mean it failed, just that we don't know the outcome yet. Leave the
      // Intent at SUBMITTED (accurate) rather than guessing FAILED, but surface a
      // clear error to the caller instead of an opaque 500.
      this.logger.error(
        `Timed out waiting for Riley's swap receipt (txHash: ${txHash})`,
        error as Error,
      );
      throw new GatewayTimeoutException(
        'Submitted the swap but timed out waiting for confirmation',
      );
    }

    if (receipt.status !== 'success') {
      return this.prisma.intent.update({
        where: { id: intent.id },
        data: { status: IntentStatus.FAILED, settledAt: new Date() },
      });
    }

    const decoded = parseEventLogs({
      abi: this.chain.handlerWalletAbi,
      logs: receipt.logs,
    });
    const blocked = decoded.some((log) => log.eventName === 'ExecutionBlocked');

    return this.prisma.intent.update({
      where: { id: intent.id },
      data: {
        status: blocked ? IntentStatus.BLOCKED : IntentStatus.CONFIRMED,
        settledAt: new Date(),
      },
    });
  }
}
