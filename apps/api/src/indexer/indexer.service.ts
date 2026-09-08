import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { parseEventLogs, type Address } from 'viem';
import { handlerWalletAbi, handlerWalletFactoryAbi } from '@handler/contracts';
import { ChainService } from '../chain/chain.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActivityType,
  ActivitySource,
  AgentKind,
  ApprovalStatus,
  IntentStatus,
  ResolutionSource,
} from '../generated/prisma/enums.js';
import { truncateAddress } from '../common/format.js';
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
  type PolicyTuple,
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

/** The factory's own WalletCreated log stream gets one fixed cursor row, distinct from
 * every per-wallet `wallet:<address>` stream. */
const FACTORY_CURSOR_KEY = 'factory';

type DecodedLog = ReturnType<
  typeof parseEventLogs<typeof handlerWalletAbi>
>[number];

type DecodedFactoryLog = ReturnType<
  typeof parseEventLogs<typeof handlerWalletFactoryAbi>
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
      await this.ensureDevWalletBootstrapped();
      await this.syncFactory();
      // Scoped to this chain — a Wallet row left over from a previous CHAIN_ID (e.g.
      // switching between local anvil and Base Sepolia, per current-feature.md history)
      // must never be synced against the wrong chain's RPC endpoint.
      const wallets = await this.prisma.wallet.findMany({
        where: { chainId: this.chain.chainId },
      });
      for (const wallet of wallets) {
        try {
          await this.syncOneWallet(wallet.address);
        } catch (error) {
          // One wallet's persistent failure must not starve every other wallet listed
          // after it in this tick — log and move on; this wallet gets retried next tick.
          this.logger.error(
            `Failed to sync wallet ${wallet.address}`,
            error as Error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Indexer tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  /** The one pre-seeded dev/demo wallet from static config never gets a WalletCreated
   * event (it's deployed directly, not via the factory — see DeployDev.s.sol), so it
   * needs its own one-time provisioning rather than relying on syncFactory() to create
   * its Wallet/cursor rows the way a factory-discovered wallet's are created. */
  private async ensureDevWalletBootstrapped() {
    const address = this.chain.handlerWalletAddress.toLowerCase();
    const key = cursorKeyFor(address);

    const cursor = await this.prisma.indexerCursor.findUnique({
      where: { key },
    });
    if (cursor) return;

    await this.prisma.$transaction(
      (tx) => this.bootstrap(tx, address, key),
      TICK_TRANSACTION_OPTIONS,
    );
  }

  /** Advances one wallet's own log stream from its own cursor. Called for every row in
   * the Wallet table (the pre-seeded dev wallet plus every factory-discovered one) —
   * assumes the wallet's IndexerCursor row already exists, created alongside its Wallet
   * row by ensureDevWalletBootstrapped() or handleWalletCreated(). */
  private async syncOneWallet(address: string) {
    const key = cursorKeyFor(address);

    const cursor = await this.prisma.indexerCursor.findUnique({
      where: { key },
    });
    if (!cursor) {
      this.logger.warn(
        `No IndexerCursor for wallet ${address} yet — skipping until one exists`,
      );
      return;
    }

    const latestBlock = await this.chain.publicClient.getBlockNumber();
    if (latestBlock <= cursor.blockNumber) return;

    const logs = await this.chain.publicClient.getLogs({
      address: address as Address,
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
      // approve() emits Approved then Executed in the same tx (contracts-roadmap §2.1) —
      // tracks which txs already got their one feed row from the Approved handler so the
      // Executed handler for the same tx doesn't write a second, duplicate row.
      const resolvedApprovalTxHashes = new Set<string>();
      for (const log of decoded) {
        await this.handleLog(
          tx,
          log,
          address,
          blockTimestamps,
          resolvedApprovalTxHashes,
        );
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

  /** Looks up the `Intent` an agent-runtime action (backend-roadmap §4.2's
   * "intent row first" rule) wrote before submitting this tx, if any —
   * chain-only activity (owner-signed hires, freezes, approvals) has no
   * matching `Intent` and this is a no-op. When found, resolves it to
   * `resolvedStatus` and stamps `settledAt`, and returns its id so the caller
   * can set `ActivityEvent.intentId`. */
  private async resolveIntentForTx(
    db: Db,
    txHash: string,
    resolvedStatus: typeof IntentStatus.CONFIRMED | typeof IntentStatus.BLOCKED,
  ): Promise<string | null> {
    const intent = await db.intent.findUnique({ where: { txHash } });
    if (!intent) return null;
    await db.intent.update({
      where: { id: intent.id },
      data: { status: resolvedStatus, settledAt: new Date() },
    });
    return intent.id;
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
    extra: { frozenAt?: Date | null } = {},
  ) {
    const raw = await this.chain.publicClient.readContract({
      address: walletAddress as Address,
      abi: this.chain.handlerWalletAbi,
      functionName: 'policies',
      args: [sessionKey as Address],
    });
    const fields = toPolicyMirrorFields(
      policyFromContractTuple(raw as PolicyTuple),
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

  /** Shared by the three events that ensure the session-key Agent exists and refresh its
   * on-chain Policy mirror (AgentHired, PolicyUpdated, AgentFrozen). */
  private async loadHiredAgentAndPolicy(
    db: Db,
    walletAddress: string,
    sessionKey: string,
    extra: { frozenAt?: Date | null } = {},
  ) {
    const agent = await this.getOrCreateHiredAgent(db, sessionKey);
    const policy = await this.upsertPolicyMirror(
      db,
      walletAddress,
      sessionKey,
      agent.id,
      extra,
    );
    return { agent, policy };
  }

  /** Shared by the events that only need the Agent row and an existing Policy's id, not a
   * fresh chain read of the policy mirror (Executed, ExecutionBlocked, Proposed). */
  private async loadAgentAndPolicyId(
    db: Db,
    walletAddress: string,
    sessionKey: string,
  ) {
    const agent = await this.getOrCreateHiredAgent(db, sessionKey);
    const policyId = await this.findPolicyId(db, walletAddress, sessionKey);
    return { agent, policyId };
  }

  private async handleLog(
    db: Db,
    log: DecodedLog,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
    resolvedApprovalTxHashes: Set<string> = new Set(),
  ) {
    switch (log.eventName) {
      case 'AgentHired':
        return this.handleAgentHired(db, log, walletAddress, blockTimestamps);
      case 'PolicyUpdated':
        return this.handlePolicyUpdated(
          db,
          log,
          walletAddress,
          blockTimestamps,
        );
      case 'AgentFrozen':
        return this.handleAgentFrozen(db, log, walletAddress, blockTimestamps);
      case 'Executed':
        return this.handleExecuted(
          db,
          log,
          walletAddress,
          blockTimestamps,
          resolvedApprovalTxHashes,
        );
      case 'ExecutionBlocked':
        return this.handleExecutionBlocked(
          db,
          log,
          walletAddress,
          blockTimestamps,
        );
      case 'Proposed':
        return this.handleProposed(db, log, walletAddress, blockTimestamps);
      case 'Approved':
      case 'Denied':
        return this.handleApprovedOrDenied(
          db,
          log,
          walletAddress,
          blockTimestamps,
          resolvedApprovalTxHashes,
        );
      default:
        return;
    }
  }

  private async handleAgentHired(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'AgentHired' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    const sessionKey = log.args.sessionKey.toLowerCase();
    const { agent, policy } = await this.loadHiredAgentAndPolicy(
      db,
      walletAddress,
      sessionKey,
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
  }

  private async handlePolicyUpdated(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'PolicyUpdated' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    const sessionKey = log.args.sessionKey.toLowerCase();
    const { agent, policy } = await this.loadHiredAgentAndPolicy(
      db,
      walletAddress,
      sessionKey,
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
  }

  private async handleAgentFrozen(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'AgentFrozen' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    const sessionKey = log.args.sessionKey.toLowerCase();
    const frozen = log.args.frozen;
    const blockTimestamp = await this.getBlockTimestamp(
      log.blockNumber,
      blockTimestamps,
    );
    const { agent, policy } = await this.loadHiredAgentAndPolicy(
      db,
      walletAddress,
      sessionKey,
      // Unfreezing clears frozenAt rather than leaving the prior freeze's timestamp
      // stale on a policy that's no longer frozen.
      frozen ? { frozenAt: blockTimestamp } : { frozenAt: null },
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
  }

  private async handleExecuted(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'Executed' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
    resolvedApprovalTxHashes: Set<string>,
  ) {
    if (resolvedApprovalTxHashes.has(log.transactionHash)) {
      // approve() emits Approved + Executed in the same tx; the Approved handler
      // already wrote this action's one feed row — skip so it isn't double-counted.
      return;
    }

    const sessionKey = log.args.sessionKey.toLowerCase();
    const target = log.args.target.toLowerCase();
    const usdValue = log.args.usdValue;
    const { agent, policyId } = await this.loadAgentAndPolicyId(
      db,
      walletAddress,
      sessionKey,
    );
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

    const intentId = await this.resolveIntentForTx(
      db,
      log.transactionHash,
      IntentStatus.CONFIRMED,
    );

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
      intentId,
    });
  }

  private async handleExecutionBlocked(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'ExecutionBlocked' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    const sessionKey = log.args.sessionKey.toLowerCase();
    const usdValue = log.args.usdValue;
    const blockReason = mapBlockReason(log.args.reason);
    const { agent, policyId } = await this.loadAgentAndPolicyId(
      db,
      walletAddress,
      sessionKey,
    );
    const blockTimestamp = await this.getBlockTimestamp(
      log.blockNumber,
      blockTimestamps,
    );

    const intentId = await this.resolveIntentForTx(
      db,
      log.transactionHash,
      IntentStatus.BLOCKED,
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
      intentId,
    });
  }

  /** Reads the stored struct for a just-proposed call: its raw calldata (needed on the
   * PendingApproval row regardless of kind) and its classification + summary. `kind` is
   * classified once by `_evaluate()` at propose time and stored on the struct, so this
   * mirrors it directly rather than re-deriving it from calldata + knownRouters (which the
   * contract itself no longer does either, now that `approve()`'s Executed event uses the
   * same stored kind). */
  private async loadProposedCallDetails(
    id: `0x${string}`,
    target: string,
    agentName: string,
    usdValue: bigint,
    db: Db,
    walletAddress: string,
  ) {
    const raw = await this.chain.publicClient.readContract({
      address: walletAddress as Address,
      abi: this.chain.handlerWalletAbi,
      functionName: 'pendingApprovals',
      args: [id],
    });
    const [, , calldata, , , , kind] = raw as readonly [
      string,
      string,
      `0x${string}`,
      bigint,
      bigint,
      boolean,
      number,
    ];

    if (isSwapKind(kind)) {
      return {
        calldata,
        counterpartyAgentId: null as string | null,
        summary: pendingSwapSummary(agentName, usdValue),
      };
    }
    const { agent: counterparty } = await this.resolveTransferCounterparty(
      db,
      target,
    );
    return {
      calldata,
      counterpartyAgentId: counterparty.id as string | null,
      summary: pendingSummary(agentName, counterparty.name, usdValue),
    };
  }

  private async handleProposed(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'Proposed' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) {
    const id = log.args.id;
    const sessionKey = log.args.sessionKey.toLowerCase();
    const target = log.args.target.toLowerCase();
    const usdValue = log.args.usdValue;
    const valueWei = log.args.value;

    const { agent, policyId } = await this.loadAgentAndPolicyId(
      db,
      walletAddress,
      sessionKey,
    );
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

    const { calldata, counterpartyAgentId, summary } =
      await this.loadProposedCallDetails(
        id,
        target,
        agent.name,
        usdValue,
        db,
        walletAddress,
      );

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
  }

  /** Names for the Approved/Denied summary line. Falls back to a truncated address only
   * when the catalogued Agent row itself is missing — not expected in steady state, but
   * defensive against a mid-migration/demo-reset gap. */
  private async resolveApprovalNames(
    db: Db,
    approval: { agentId: string; counterpartyAgentId: string | null; target: string },
    agentFallbackAddress: string,
  ) {
    const counterparty = approval.counterpartyAgentId
      ? await db.agent.findUnique({
          where: { id: approval.counterpartyAgentId },
        })
      : null;
    const agent = await db.agent.findUnique({
      where: { id: approval.agentId },
    });
    return {
      // Falls back to the acting agent's own session key, never `target` (the
      // counterparty/router address) — the two are different addresses.
      agentName: agent?.name ?? truncateAddress(agentFallbackAddress),
      counterpartyName: counterparty?.name ?? truncateAddress(approval.target),
    };
  }

  private async handleApprovedOrDenied(
    db: Db,
    log: Extract<DecodedLog, { eventName: 'Approved' | 'Denied' }>,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
    resolvedApprovalTxHashes: Set<string>,
  ) {
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
    if (approved) {
      resolvedApprovalTxHashes.add(log.transactionHash);
    }
    const blockTimestamp = await this.getBlockTimestamp(
      log.blockNumber,
      blockTimestamps,
    );
    // Fetched once and reused below for the approved-branch policy mirror refresh —
    // also gives resolveApprovalNames a same-agent fallback address (the session key)
    // instead of the counterparty/router address if the Agent row is ever missing.
    const policy = await db.policy.findUnique({
      where: { id: approval.policyId },
    });
    const { agentName, counterpartyName } = await this.resolveApprovalNames(
      db,
      approval,
      policy?.sessionKey ?? approval.target,
    );

    await db.pendingApproval.update({
      where: { id },
      data: {
        status: approved ? ApprovalStatus.APPROVED : ApprovalStatus.DENIED,
        resolvedTxHash: log.transactionHash,
        resolvedAt: blockTimestamp,
        resolutionSource: ResolutionSource.CHAIN,
      },
    });

    if (approved && policy) {
      await this.upsertPolicyMirror(
        db,
        walletAddress,
        policy.sessionKey,
        approval.agentId,
      );
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

  /** Watches HandlerWalletFactory's own WalletCreated log stream (cursor key "factory"),
   * distinct from every per-wallet `wallet:<address>` stream. No-op when the factory isn't
   * deployed on this chain yet (chain.handlerWalletFactoryAddress is null) — see
   * resolveHandlerWalletFactoryAddress. */
  private async syncFactory() {
    const factoryAddress = this.chain.handlerWalletFactoryAddress;
    if (!factoryAddress) return;

    const cursor = await this.prisma.indexerCursor.findUnique({
      where: { key: FACTORY_CURSOR_KEY },
    });

    if (!cursor) {
      await this.prisma.indexerCursor.create({
        data: { key: FACTORY_CURSOR_KEY, blockNumber: 0n },
      });
      return;
    }

    const latestBlock = await this.chain.publicClient.getBlockNumber();
    if (latestBlock <= cursor.blockNumber) return;

    const logs = await this.chain.publicClient.getLogs({
      address: factoryAddress,
      fromBlock: cursor.blockNumber + 1n,
      toBlock: latestBlock,
    });
    const decoded = parseEventLogs({
      abi: this.chain.handlerWalletFactoryAbi,
      logs,
    }) as DecodedFactoryLog[];

    await this.prisma.$transaction(async (tx) => {
      for (const log of decoded) {
        if (log.eventName === 'WalletCreated') {
          await this.handleWalletCreated(tx, log);
        }
      }
      await tx.indexerCursor.update({
        where: { key: FACTORY_CURSOR_KEY },
        data: { blockNumber: latestBlock },
      });
    }, TICK_TRANSACTION_OPTIONS);
  }

  private async handleWalletCreated(
    db: Db,
    log: Extract<DecodedFactoryLog, { eventName: 'WalletCreated' }>,
  ) {
    const walletAddress = log.args.wallet.toLowerCase();
    const owner = log.args.owner.toLowerCase();

    await db.wallet.upsert({
      where: { address: walletAddress },
      update: {},
      create: {
        address: walletAddress,
        chainId: this.chain.chainId,
        owner,
        createdTxHash: log.transactionHash,
        createdBlock: log.blockNumber,
        isDemo: false,
      },
    });

    const key = cursorKeyFor(walletAddress);
    const existingCursor = await db.indexerCursor.findUnique({
      where: { key },
    });
    if (!existingCursor) {
      // One block before the WalletCreated block, so this wallet's own future syncs
      // (which start at cursor + 1) include the creation block itself — nothing on this
      // address exists any earlier, so nothing before it is ever missed either way.
      await db.indexerCursor.create({
        data: { key, blockNumber: log.blockNumber - 1n },
      });
    }
  }
}
