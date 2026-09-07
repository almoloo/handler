import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { parseEventLogs, type Address } from 'viem';
import { handlerWalletAbi } from '@handler/contracts';
import { ChainService } from '../chain/chain.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActivityType,
  ActivitySource,
  AgentKind,
  ApprovalStatus,
  ResolutionSource,
} from '../generated/prisma/enums.js';
import { truncateAddress } from './format.js';
import {
  approvedSummary,
  blockedSummary,
  deniedSummary,
  frozenSummary,
  hiredSummary,
  isSwapKind,
  mapBlockReason,
  paymentSummary,
  pendingSummary,
  pendingSwapSummary,
  policyFromContractTuple,
  policyUpdatedSummary,
  swapSummary,
  toPolicyMirrorFields,
  transferSummary,
} from './event-mapping.js';

/** One row per watched wallet's log stream, per context/backend-roadmap.md §3. */
export function cursorKeyFor(walletAddress: string): string {
  return `wallet:${walletAddress.toLowerCase()}`;
}

type DecodedLog = ReturnType<
  typeof parseEventLogs<typeof handlerWalletAbi>
>[number];

/** Either the top-level client or an interactive-transaction client — same model API surface. */
type Db = Prisma.TransactionClient;

/** ActivityEvent rows are idempotent on (txHash, logIndex) — every chain-sourced row has both. */
type ActivityEventData = Prisma.ActivityEventUncheckedCreateInput & {
  txHash: string;
  logIndex: number;
};

// A generous transaction timeout: a tick's block range can touch several events, each
// possibly making a chain read (policies/pendingApprovals) inside the same transaction.
const TICK_TRANSACTION_OPTIONS = { timeout: 15_000 };

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  // @Interval is a plain setInterval — it does not wait for the previous tick() to
  // resolve, so a tick slower than the 3s period (a big block range, RPC latency) would
  // otherwise overlap with the next one and race on the same cursor/agent rows.
  private running = false;

  constructor(
    private readonly chain: ChainService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(3000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncWallet();
    } catch (error) {
      this.logger.error('Indexer tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  private async syncWallet() {
    const address = this.chain.handlerWalletAddress.toLowerCase();
    const key = cursorKeyFor(address);

    const cursor = await this.prisma.indexerCursor.findUnique({
      where: { key },
    });

    if (!cursor) {
      await this.prisma.$transaction(
        (tx) => this.bootstrap(tx, address, key),
        TICK_TRANSACTION_OPTIONS,
      );
      return;
    }

    const latestBlock = await this.chain.publicClient.getBlockNumber();
    if (latestBlock <= cursor.blockNumber) return;

    const logs = await this.chain.publicClient.getLogs({
      address: this.chain.handlerWalletAddress,
      fromBlock: cursor.blockNumber + 1n,
      toBlock: latestBlock,
    });
    const decoded = parseEventLogs({
      abi: this.chain.handlerWalletAbi,
      logs,
    });

    // Effects (all writes) and the cursor advance commit together, so a crash or thrown
    // error partway through a block range never leaves the cursor ahead of what was
    // actually written — the next tick safely reprocesses the same range.
    await this.prisma.$transaction(async (tx) => {
      const blockTimestamps = new Map<bigint, Date>();
      for (const log of decoded) {
        await this.handleLog(tx, log, address, blockTimestamps);
      }
      await tx.indexerCursor.update({
        where: { key },
        data: { blockNumber: latestBlock },
      });
    }, TICK_TRANSACTION_OPTIONS);
  }

  private async getBlockTimestamp(
    blockNumber: bigint,
    cache: Map<bigint, Date>,
  ): Promise<Date> {
    const cached = cache.get(blockNumber);
    if (cached) return cached;
    const block = await this.chain.publicClient.getBlock({ blockNumber });
    const date = new Date(Number(block.timestamp) * 1000);
    cache.set(blockNumber, date);
    return date;
  }

  private async upsertActivityEvent(db: Db, data: ActivityEventData) {
    return db.activityEvent.upsert({
      where: {
        txHash_logIndex: { txHash: data.txHash, logIndex: data.logIndex },
      },
      create: data,
      update: data,
    });
  }

  private async getOrCreateHiredAgent(db: Db, sessionKey: string) {
    return db.agent.upsert({
      where: { address: sessionKey },
      update: { kind: AgentKind.HIRED },
      create: {
        address: sessionKey,
        name: truncateAddress(sessionKey),
        kind: AgentKind.HIRED,
      },
    });
  }

  private async upsertPolicyMirror(
    db: Db,
    walletAddress: string,
    sessionKey: string,
    agentId: string,
    extra: { frozenAt?: Date } = {},
  ) {
    const raw = await this.chain.publicClient.readContract({
      address: this.chain.handlerWalletAddress,
      abi: this.chain.handlerWalletAbi,
      functionName: 'policies',
      args: [sessionKey as Address],
    });
    const fields = toPolicyMirrorFields(
      policyFromContractTuple(
        raw as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          number,
          boolean,
          boolean,
          boolean,
        ],
      ),
    );

    return db.policy.upsert({
      where: { walletAddress_sessionKey: { walletAddress, sessionKey } },
      update: { ...fields, ...extra },
      create: { walletAddress, sessionKey, agentId, ...fields, ...extra },
    });
  }

  /**
   * Resolves the counterparty of a plain transfer. If it's already a catalogued Agent
   * (HIRED or COUNTERPARTY), this is an AGENT_PAYMENT; otherwise it's auto-vivified as a
   * new COUNTERPARTY and classified as a plain TRANSFER. A later `trust` module seeding
   * real catalog agents changes this classification for free — no indexer change needed.
   */
  private async resolveTransferCounterparty(db: Db, target: string) {
    const existing = await db.agent.findUnique({
      where: { address: target },
    });
    if (existing) {
      return { agent: existing, type: ActivityType.AGENT_PAYMENT };
    }
    const created = await db.agent.create({
      data: {
        address: target,
        name: truncateAddress(target),
        kind: AgentKind.COUNTERPARTY,
      },
    });
    return { agent: created, type: ActivityType.TRANSFER };
  }

  private async findPolicyId(db: Db, walletAddress: string, sessionKey: string) {
    const policy = await db.policy.findUnique({
      where: { walletAddress_sessionKey: { walletAddress, sessionKey } },
    });
    return policy?.id ?? null;
  }

  private async handleLog(
    db: Db,
    log: DecodedLog,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    switch (log.eventName) {
      case 'AgentHired': {
        const sessionKey = log.args.sessionKey.toLowerCase();
        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const policy = await this.upsertPolicyMirror(
          db,
          walletAddress,
          sessionKey,
          agent.id,
        );
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );
        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId: policy.id,
          agentId: agent.id,
          type: ActivityType.HIRED,
          source: ActivitySource.CHAIN,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary: hiredSummary(agent.name),
        });
        return;
      }
      case 'PolicyUpdated': {
        const sessionKey = log.args.sessionKey.toLowerCase();
        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const policy = await this.upsertPolicyMirror(
          db,
          walletAddress,
          sessionKey,
          agent.id,
        );
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );
        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId: policy.id,
          agentId: agent.id,
          type: ActivityType.POLICY_UPDATED,
          source: ActivitySource.CHAIN,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary: policyUpdatedSummary(agent.name),
        });
        return;
      }
      case 'AgentFrozen': {
        const sessionKey = log.args.sessionKey.toLowerCase();
        const frozen = log.args.frozen;
        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );
        const policy = await this.upsertPolicyMirror(
          db,
          walletAddress,
          sessionKey,
          agent.id,
          frozen ? { frozenAt: blockTimestamp } : {},
        );
        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId: policy.id,
          agentId: agent.id,
          type: frozen ? ActivityType.FROZEN : ActivityType.UNFROZEN,
          source: ActivitySource.CHAIN,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary: frozenSummary(agent.name, frozen),
        });
        return;
      }
      case 'Executed': {
        const sessionKey = log.args.sessionKey.toLowerCase();
        const target = log.args.target.toLowerCase();
        const usdValue = log.args.usdValue;
        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const policyId = await this.findPolicyId(db, walletAddress, sessionKey);
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );

        let type: ActivityType;
        let counterpartyAgentId: string | null = null;
        let summary: string;
        if (isSwapKind(log.args.kind)) {
          type = ActivityType.SWAP;
          summary = swapSummary(agent.name, usdValue);
        } else {
          const { agent: counterparty, type: transferType } =
            await this.resolveTransferCounterparty(db, target);
          type = transferType;
          counterpartyAgentId = counterparty.id;
          summary =
            transferType === ActivityType.AGENT_PAYMENT
              ? paymentSummary(agent.name, counterparty.name, usdValue)
              : transferSummary(agent.name, counterparty.name, usdValue);
        }

        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId,
          agentId: agent.id,
          counterpartyAgentId,
          type,
          source: ActivitySource.CHAIN,
          amountUsd: usdValue,
          target,
          counterpartyAddress: target,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary,
        });
        return;
      }
      case 'ExecutionBlocked': {
        const sessionKey = log.args.sessionKey.toLowerCase();
        const usdValue = log.args.usdValue;
        const blockReason = mapBlockReason(log.args.reason);
        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const policyId = await this.findPolicyId(db, walletAddress, sessionKey);
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );

        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId,
          agentId: agent.id,
          type: ActivityType.BLOCKED,
          source: ActivitySource.CHAIN,
          blockReason,
          amountUsd: usdValue,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary: blockedSummary(agent.name, blockReason),
        });
        return;
      }
      case 'Proposed': {
        const id = log.args.id;
        const sessionKey = log.args.sessionKey.toLowerCase();
        const target = log.args.target.toLowerCase();
        const usdValue = log.args.usdValue;
        const valueWei = log.args.value;

        const agent = await this.getOrCreateHiredAgent(db, sessionKey);
        const policyId = await this.findPolicyId(db, walletAddress, sessionKey);
        if (!policyId) {
          this.logger.warn(
            `Proposed ${id} for ${sessionKey} with no Policy mirror yet — skipping`,
          );
          return;
        }
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );

        // The Proposed event doesn't carry calldata or the call's kind — read the stored
        // struct through, and check knownRouters the same way _evaluate() classifies
        // Executed, so a proposed swap isn't mislabeled as a payment to the router.
        const raw = await this.chain.publicClient.readContract({
          address: this.chain.handlerWalletAddress,
          abi: this.chain.handlerWalletAbi,
          functionName: 'pendingApprovals',
          args: [id],
        });
        const [, , calldata] = raw as readonly [
          string,
          string,
          `0x${string}`,
          bigint,
          bigint,
          boolean,
        ];
        const isKnownRouter = await this.chain.publicClient.readContract({
          address: this.chain.handlerWalletAddress,
          abi: this.chain.handlerWalletAbi,
          functionName: 'knownRouters',
          args: [target as Address],
        });
        const isSwap = calldata !== '0x' && Boolean(isKnownRouter);

        let counterpartyAgentId: string | null = null;
        let summary: string;
        if (isSwap) {
          summary = pendingSwapSummary(agent.name, usdValue);
        } else {
          const { agent: counterparty } = await this.resolveTransferCounterparty(
            db,
            target,
          );
          counterpartyAgentId = counterparty.id;
          summary = pendingSummary(agent.name, counterparty.name, usdValue);
        }

        await db.pendingApproval.upsert({
          where: { id },
          create: {
            id,
            walletAddress,
            policyId,
            agentId: agent.id,
            counterpartyAgentId,
            amountUsd: usdValue,
            target,
            valueRaw: valueWei.toString(),
            calldata,
            decoded: { target, valueRaw: valueWei.toString() },
            summary,
            status: ApprovalStatus.PENDING,
            proposedTxHash: log.transactionHash,
            proposedBlock: log.blockNumber,
            proposedAt: blockTimestamp,
          },
          update: {},
        });
        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId,
          agentId: agent.id,
          counterpartyAgentId,
          type: ActivityType.PENDING,
          source: ActivitySource.CHAIN,
          amountUsd: usdValue,
          target,
          counterpartyAddress: target,
          pendingApprovalId: id,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary,
        });
        return;
      }
      case 'Approved':
      case 'Denied': {
        const id = log.args.id;
        const approval = await db.pendingApproval.findUnique({
          where: { id },
        });
        if (!approval) {
          this.logger.warn(
            `${log.eventName} ${id} has no PendingApproval row — skipping`,
          );
          return;
        }

        const approved = log.eventName === 'Approved';
        const blockTimestamp = await this.getBlockTimestamp(
          log.blockNumber,
          blockTimestamps,
        );
        const counterparty = approval.counterpartyAgentId
          ? await db.agent.findUnique({
              where: { id: approval.counterpartyAgentId },
            })
          : null;
        const agent = await db.agent.findUnique({
          where: { id: approval.agentId },
        });
        const agentName = agent?.name ?? truncateAddress(approval.target);
        const counterpartyName =
          counterparty?.name ?? truncateAddress(approval.target);

        await db.pendingApproval.update({
          where: { id },
          data: {
            status: approved ? ApprovalStatus.APPROVED : ApprovalStatus.DENIED,
            resolvedTxHash: log.transactionHash,
            resolvedAt: blockTimestamp,
            resolutionSource: ResolutionSource.CHAIN,
          },
        });

        if (approved) {
          const policy = await db.policy.findUnique({
            where: { id: approval.policyId },
          });
          if (policy) {
            await this.upsertPolicyMirror(
              db,
              walletAddress,
              policy.sessionKey,
              approval.agentId,
            );
          }
        }

        await this.upsertActivityEvent(db, {
          walletAddress,
          policyId: approval.policyId,
          agentId: approval.agentId,
          counterpartyAgentId: approval.counterpartyAgentId,
          type: approved ? ActivityType.APPROVED : ActivityType.DENIED,
          source: ActivitySource.CHAIN,
          amountUsd: approval.amountUsd,
          target: approval.target,
          counterpartyAddress: approval.target,
          pendingApprovalId: id,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp,
          summary: approved
            ? approvedSummary(agentName, counterpartyName, approval.amountUsd)
            : deniedSummary(agentName, counterpartyName, approval.amountUsd),
        });
        return;
      }
      default:
        return;
    }
  }

  private async bootstrap(db: Db, address: string, key: string) {
    const owner = await this.chain.publicClient.readContract({
      address: this.chain.handlerWalletAddress,
      abi: this.chain.handlerWalletAbi,
      functionName: 'owner',
    });

    await db.wallet.upsert({
      where: { address },
      update: {},
      create: {
        address,
        chainId: this.chain.chainId,
        owner: (owner as string).toLowerCase(),
        isDemo: true,
      },
    });

    // Starts at block 0 rather than "now" so a manual tx sent before the
    // indexer's first tick still gets picked up — cheap to replay in full
    // on a small local anvil chain. A testnet deployment would want to seed
    // this at the wallet's deploy block instead.
    await db.indexerCursor.create({
      data: { key, blockNumber: 0n },
    });
  }
}
