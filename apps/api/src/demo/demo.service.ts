import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AgentsService } from '../agents/agents.service.js';
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
  // could otherwise start a second beat mid-flight and double-submit a real
  // payment. Same guard as AgentsService.tick()/VillainService.tick().
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
    private readonly villain: VillainService,
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
    if (this.running) {
      throw new ConflictException(
        'A demo beat is already running — wait for it to finish.',
      );
    }
    this.running = true;
    try {
      const walletAddress = await this.showcaseWalletAddress();
      return await this.executeBeat(beat, walletAddress);
    } finally {
      this.running = false;
    }
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
