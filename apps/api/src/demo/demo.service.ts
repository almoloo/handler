import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AgentsService } from '../agents/agents.service.js';
import { ChainService } from '../chain/chain.service.js';
import {
  CURSOR_TRANSACTION_OPTIONS,
  cursorKeyFor,
} from '../indexer/cursor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DemoRunStatus } from '../generated/prisma/enums.js';
import {
  parseDemoEnv,
  type DemoEnabled,
  type DemoEnv,
} from './demo.config.js';
import { VillainService } from './villain.service.js';

/** The beats the director can trigger. Renumbered from backend-roadmap §4.6's
 * original four when the 1inch cut removed beat 1's content ("Riley begins
 * rebalancing"), leaving Riley's Subcontractor payment as both beat 1 and
 * beat 2 — see context/current-feature.md. Each is a distinct on-chain
 * outcome, and the contract decides which one actually happens. */
export const BEATS = {
  1: 'Riley pays the Subcontractor',
  2: 'Send the villain',
  3: 'Riley over the co-sign cap',
} as const;

export type BeatNumber = keyof typeof BEATS;

/** `DemoRun.beat` value the schema reserves for a reset. */
export const RESET_BEAT = 0;


export function isBeatNumber(value: number): value is BeatNumber {
  return value === 1 || value === 2 || value === 3;
}

/**
 * The demo director's operator tooling (backend-roadmap §4.6). It triggers
 * the *same* real agent actions the crons already perform, against the
 * showcase wallet, and records each trigger as a `DemoRun` the `/demo` screen
 * can render. It controls timing, never results: every beat is a real
 * `tryExecute` through the real trust/cap/allowance checks, and whatever the
 * contract decides is what the feed shows.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly env: DemoEnv;
  // A beat awaits a real tx submit + receipt, so a mashed director button
  // could otherwise start a second action mid-flight and double-submit a real
  // payment. Same guard as AgentsService.tick()/VillainService.tick(); see
  // withSingleFlight() for why beats and resets share one flag.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
    private readonly villain: VillainService,
    private readonly chain: ChainService,
    // Not a Nest provider: `@Optional()` makes Nest pass `undefined` so the
    // default runs, while tests hand in an env object directly.
    @Optional() env: DemoEnv = parseDemoEnv(),
  ) {
    this.env = env;
  }

  /**
   * Runs one beat end-to-end and returns its finished `DemoRun`.
   *
   * Failure handling is deliberately split: anything that happens *during*
   * the beat is recorded on the run as `FAILED` and returned, because the
   * operator needs the reason on screen mid-take. Only a pre-flight problem
   * — no showcase wallet to act on, or another beat already in flight —
   * throws, since there is no run to record it against.
   */
  async runBeat(beat: BeatNumber) {
    return this.withSingleFlight(async () => {
      const walletAddress = await this.showcaseWalletAddress();
      return this.executeBeat(beat, walletAddress);
    });
  }

  /** Serializes every director action against every other one. Shared rather
   * than per-operation on purpose: a reset landing mid-beat would delete the
   * `Intent` row the beat just wrote and rewind the cursor underneath it. */
  private async withSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new ConflictException(
        'A demo action is already running — wait for it to finish.',
      );
    }
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }

  /**
   * Clears the showcase wallet's feed so the next video take opens on an empty
   * activity list, and returns the finished `DemoRun`.
   *
   * What this can and cannot do matters (backend-roadmap §4.6): a beat's
   * transactions are real on-chain events and nothing here un-happens them.
   * `spentThisEpoch` lives on-chain, freezes need an owner signature, and there
   * is no mainnet faucet. All a reset does is delete this wallet's indexed rows
   * and move its cursor to the current block, so the feed refills only with the
   * take about to be recorded — nothing false is shown, some true-but-old rows
   * simply stop being displayed, and the chain stays the source of truth.
   *
   * Deliberately *not* a replay from the wallet's creation block: chain rows are
   * idempotent by `(txHash, logIndex)`, so replaying would re-create exactly what
   * was just deleted and the feed would be unchanged.
   */
  async reset() {
    return this.withSingleFlight(async () => {
      const walletAddress = await this.showcaseWalletAddress();
      return this.executeReset(walletAddress);
    });
  }

  /**
   * Known race, accepted: `withSingleFlight` serializes this against beats but
   * not against `IndexerService`'s own 3s tick, which is a separate service with
   * its own guard. A tick that read the old cursor and fetched logs just before
   * this commits will re-insert some of those rows afterwards. Reset is
   * idempotent and fast, so the operator taps it again — don't add cross-module
   * pause plumbing for a cosmetic, self-healing failure.
   */
  private async executeReset(walletAddress: string) {
    const run = await this.prisma.demoRun.create({
      data: { beat: RESET_BEAT, status: DemoRunStatus.RUNNING, log: [] },
    });

    const log = [`Reset: clear the showcase wallet's feed`, `Wallet ${walletAddress}`];

    try {
      // Fetched before the transaction opens: holding a Postgres transaction
      // across an RPC round trip is how the indexer's timeouts get hit under a
      // slow provider. A block number that goes stale between here and the
      // commit is harmless — the cursor lands a block or two early and the next
      // tick re-indexes that gap idempotently.
      const blockNumber = await this.chain.publicClient.getBlockNumber();

      const counts = await this.clearWalletFeed(walletAddress, blockNumber);

      log.push(
        `Deleted ${counts.activity} activity rows, ${counts.approvals} pending approvals, ${counts.intents} intents.`,
      );
      log.push(`Indexing resumes from block ${blockNumber}.`);

      return await this.prisma.demoRun.update({
        where: { id: run.id },
        data: {
          status: DemoRunStatus.SUCCEEDED,
          log,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reset failed: ${message}`);
      log.push(`Failed: ${message}`);
      return await this.prisma.demoRun.update({
        where: { id: run.id },
        data: {
          status: DemoRunStatus.FAILED,
          log,
          error: message,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * Deletes one wallet's feed rows and moves its indexer cursor, atomically.
   *
   * Every filter is scoped to `walletAddress` — an unscoped `deleteMany` here
   * would wipe another user's feed, which is the one unrecoverable mistake
   * available in this service. Deletes run child-first: `ActivityEvent` holds
   * FKs to both `PendingApproval` and `Intent`. `Policy` is deliberately left
   * alone; the agents are still hired on-chain, so the mirror is still correct.
   *
   * The cursor write must land in the same transaction as the deletes, or the
   * 3s indexer tick can re-insert the rows before the cursor moves.
   */
  private clearWalletFeed(walletAddress: string, blockNumber: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activityEvent.deleteMany({
        where: { walletAddress },
      });
      const approvals = await tx.pendingApproval.deleteMany({
        where: { walletAddress },
      });
      const intents = await tx.intent.deleteMany({ where: { walletAddress } });

      const key = cursorKeyFor(walletAddress);
      await tx.indexerCursor.upsert({
        where: { key },
        update: { blockNumber },
        create: { key, blockNumber },
      });

      return {
        activity: activity.count,
        approvals: approvals.count,
        intents: intents.count,
      };
    }, CURSOR_TRANSACTION_OPTIONS);
  }

  /** The single place the config is narrowed to its enabled arm. Unreachable
   * through the guarded routes (`DemoGuard` 404s when the director is off);
   * belt-and-braces for a direct service call. */
  private get enabledEnv(): DemoEnabled {
    if (!this.env.enabled) {
      throw new UnprocessableEntityException('The demo director is disabled.');
    }
    return this.env;
  }

  /** The showcase wallet is whichever `HandlerWallet` the configured demo
   * owner created — resolved at run time, so re-creating it needs no config
   * change. Flags the row `isDemo` (the column's only writer; 8b's reset
   * scopes its deletions by it). */
  private async showcaseWalletAddress(): Promise<string> {
    const owner = this.enabledEnv.DEMO_OWNER_ADDRESS.toLowerCase();
    const walletAddress = await this.agents.walletAddressForOwner(owner);
    if (!walletAddress) {
      throw new UnprocessableEntityException(
        'The showcase owner has no Handler wallet yet — create one from the app (hire an agent) before running a beat.',
      );
    }

    await this.prisma.wallet.update({
      where: { address: walletAddress },
      data: { isDemo: true },
    });
    return walletAddress;
  }

  /** Creates the run row *before* acting, so an interrupted beat is still
   * visible as `RUNNING` rather than leaving no trace. */
  private async executeBeat(beat: BeatNumber, walletAddress: string) {
    const run = await this.prisma.demoRun.create({
      data: { beat, status: DemoRunStatus.RUNNING, log: [] },
    });

    const log = [`Beat ${beat}: ${BEATS[beat]}`, `Wallet ${walletAddress}`];

    try {
      await this.dispatch(beat, walletAddress, run.id);
      log.push('Submitted on-chain — the feed shows what the policy decided.');
      return await this.prisma.demoRun.update({
        where: { id: run.id },
        data: {
          status: DemoRunStatus.SUCCEEDED,
          log,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Beat ${beat} failed: ${message}`);
      log.push(`Failed: ${message}`);
      return await this.prisma.demoRun.update({
        where: { id: run.id },
        data: {
          status: DemoRunStatus.FAILED,
          log,
          error: message,
          finishedAt: new Date(),
        },
      });
    }
  }

  /** The only place a beat number turns into an action. Beats 1 and 3 are the
   * same call at different amounts — the wallet's own `cosignAboveUsd` is
   * what makes one execute and the other queue for the owner's Ledger. */
  private dispatch(
    beat: BeatNumber,
    walletAddress: string,
    demoRunId: string,
  ): Promise<void> {
    switch (beat) {
      case 1:
        return this.agents.payWalletForDemo({
          walletAddress,
          valueWei: this.agents.paymentWei,
          demoRunId,
        });
      case 2:
        return this.villain.attemptForDemo({ walletAddress, demoRunId });
      case 3:
        return this.agents.payWalletForDemo({
          walletAddress,
          valueWei: this.enabledEnv.DEMO_COSIGN_PAYMENT_WEI,
          demoRunId,
        });
    }
  }
}
