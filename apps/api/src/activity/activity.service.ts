import { Injectable, BadRequestException, type MessageEvent } from '@nestjs/common';
import { from, interval, type Observable } from 'rxjs';
import { concatMap, map, tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityType } from '../generated/prisma/enums.js';
import { parseActivityEnv, type ActivityEnv } from './activity.config.js';

export type ActivityPage = {
  items: ActivityItem[];
  nextCursor: string | null;
};

export type ActivityAgentRef = {
  id: string;
  name: string;
  avatar: string | null;
} | null;

/** The slice of an `ActivityEvent` row (with `agent`/`counterparty` included)
 * {@link ActivityService.mapToItem} needs. */
export type ActivityEventFields = {
  id: string;
  seq: bigint;
  type: string;
  source: string;
  blockReason: string | null;
  amountUsd: bigint | null;
  tokenAddress: string | null;
  tokenAmountRaw: { toString(): string } | null;
  target: string | null;
  txHash: string | null;
  summary: string;
  detail: unknown;
  pendingApprovalId: string | null;
  createdAt: Date;
  agent: { id: string; name: string; avatar: string | null } | null;
  counterparty: { id: string; name: string; avatar: string | null } | null;
};

export type ActivityItem = {
  id: string;
  seq: string;
  type: string;
  source: string;
  blockReason: string | null;
  amountUsd: string | null;
  tokenAddress: string | null;
  tokenAmountRaw: string | null;
  target: string | null;
  agent: ActivityAgentRef;
  counterparty: ActivityAgentRef;
  txHash: string | null;
  summary: string;
  detail: Record<string, unknown>;
  pendingApprovalId: string | null;
  createdAt: string;
};

const FILTER_TO_TYPE: Record<string, ActivityType | undefined> = {
  all: undefined,
  blocked: ActivityType.BLOCKED,
  pending: ActivityType.PENDING,
};

function toAgentRef(
  agent: { id: string; name: string; avatar: string | null } | null,
): ActivityAgentRef {
  return agent ? { id: agent.id, name: agent.name, avatar: agent.avatar } : null;
}

const DEFAULT_PAGE_LIMIT = 20;
/** One SSE polling tick's row cap — bounds a single tick's query/emit cost if
 * a wallet has a huge backlog since its last-seen `seq` (e.g. a long-idle
 * reconnect). The rest streams out over the following ticks. */
const POLL_BATCH_LIMIT = 50;
/** Shared by every `ActivityEvent` query that feeds {@link ActivityService.mapToItem} —
 * one place to update if the feed ever needs a third relation. */
const ACTIVITY_INCLUDE = { agent: true, counterparty: true } as const;

export type PollResult = { items: ActivityItem[]; nextSeq: bigint };

@Injectable()
export class ActivityService {
  private readonly env: ActivityEnv;

  constructor(private readonly prisma: PrismaService) {
    this.env = parseActivityEnv();
  }

  /** Resolves the session's `HandlerWallet` address, or `null` if this owner
   * hasn't hired anyone yet. Deliberately duplicates
   * `AgentsService.walletAddressForOwner`'s query rather than importing
   * `AgentsModule` — that would drag in `ChainModule` transitively, which
   * would break `activity`'s read/serve-only classification (see
   * current-feature.md's Notes for the AI). */
  async walletAddressForOwner(ownerAddress: string): Promise<string | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { owner: ownerAddress },
    });
    return wallet?.address ?? null;
  }

  /** Paginated feed for one wallet (`GET /activity`). `seq desc`, `before`
   * (exclusive) walks further into the past. `nextCursor` is the oldest
   * returned item's `seq`, or `null` when the page came back short (no more
   * rows to fetch). */
  async listForWallet(
    walletAddress: string,
    options: { type?: ActivityType; before?: bigint; limit?: number },
  ): Promise<ActivityPage> {
    const limit = options.limit ?? DEFAULT_PAGE_LIMIT;
    const events = await this.prisma.activityEvent.findMany({
      where: {
        walletAddress,
        ...(options.type ? { type: options.type } : {}),
        ...(options.before !== undefined
          ? { seq: { lt: options.before } }
          : {}),
      },
      include: ACTIVITY_INCLUDE,
      orderBy: { seq: 'desc' },
      take: limit,
    });

    const items = events.map((event) => this.mapToItem(event));
    const nextCursor =
      items.length === limit ? items[items.length - 1].seq : null;

    return { items, nextCursor };
  }

  /** One SSE polling tick: rows newer than `sinceSeq` for this wallet, oldest
   * first, capped at `POLL_BATCH_LIMIT`. A plain async method (no RxJS) on
   * purpose — {@link ActivityService.streamForWallet} is the only thing that
   * wraps it in an interval, so this stays directly unit-testable without
   * fake timers. Returns `sinceSeq` unchanged when nothing new arrived. */
  async pollNewEvents(
    walletAddress: string,
    sinceSeq: bigint,
  ): Promise<PollResult> {
    const events = await this.prisma.activityEvent.findMany({
      where: { walletAddress, seq: { gt: sinceSeq } },
      include: ACTIVITY_INCLUDE,
      orderBy: { seq: 'asc' },
      take: POLL_BATCH_LIMIT,
    });

    if (events.length === 0) {
      return { items: [], nextSeq: sinceSeq };
    }

    const items = events.map((event) => this.mapToItem(event));
    const nextSeq = events[events.length - 1].seq;
    return { items, nextSeq };
  }

  /** The starting cursor for a new `GET /events/stream` connection. Honors
   * `Last-Event-ID` (browsers set this automatically on EventSource
   * reconnect — `ActivityEvent.seq` is deliberately its own resume cursor,
   * per the schema's doc comment) when it's present and parses as a bigint;
   * otherwise starts from the wallet's current latest `seq`, so a fresh
   * connection only sees events from now on — history is `GET /activity`'s
   * job, not this stream's. */
  async resolveStartingCursor(
    walletAddress: string,
    lastEventId?: string,
  ): Promise<bigint> {
    if (lastEventId) {
      try {
        return BigInt(lastEventId);
      } catch {
        // Malformed Last-Event-ID — fall through to "start from now" below.
      }
    }
    const latest = await this.prisma.activityEvent.findFirst({
      where: { walletAddress },
      orderBy: { seq: 'desc' },
    });
    return latest?.seq ?? 0n;
  }

  /** Wraps {@link pollNewEvents} in a poll interval, threading the cursor
   * forward tick to tick, emitting one SSE `MessageEvent` per new row.
   * `concatMap` keeps ticks sequential — a slow poll delays the next tick's
   * start rather than overlapping it (same tolerance as the indexer's own
   * cron, see indexer.service.ts). One Observable per SSE connection; not
   * meant to be shared across multiple subscribers. */
  streamForWallet(walletAddress: string, sinceSeq: bigint): Observable<MessageEvent> {
    let cursor = sinceSeq;
    return interval(this.env.ACTIVITY_SSE_POLL_MS).pipe(
      concatMap(() => from(this.pollNewEvents(walletAddress, cursor))),
      tap((result) => {
        cursor = result.nextSeq;
      }),
      concatMap((result) => from(result.items)),
      map((item): MessageEvent => ({ id: item.seq, data: item })),
    );
  }

  /** `'all' | 'blocked' | 'pending'` -> the `ActivityType` to filter on
   * (`undefined` for `'all'`, meaning no filter). Throws on anything else —
   * an invalid filter is a 400, never a silent fallback to `'all'`. */
  parseFilter(raw: string): ActivityType | undefined {
    if (!(raw in FILTER_TO_TYPE)) {
      throw new BadRequestException(`Invalid filter: ${raw}`);
    }
    return FILTER_TO_TYPE[raw];
  }

  /** Maps one `ActivityEvent` row to the locked `ActivityItem` DTO. Every
   * BigInt/Decimal field becomes a string at this boundary, matching every
   * other API boundary in this codebase (no global BigInt.toJSON patch). */
  mapToItem(event: ActivityEventFields): ActivityItem {
    return {
      id: event.id,
      seq: event.seq.toString(),
      type: event.type,
      source: event.source,
      blockReason: event.blockReason,
      amountUsd: event.amountUsd === null ? null : event.amountUsd.toString(),
      tokenAddress: event.tokenAddress,
      tokenAmountRaw:
        event.tokenAmountRaw === null ? null : event.tokenAmountRaw.toString(),
      target: event.target,
      agent: toAgentRef(event.agent),
      counterparty: toAgentRef(event.counterparty),
      txHash: event.txHash,
      summary: event.summary,
      detail: (event.detail ?? {}) as Record<string, unknown>,
      pendingApprovalId: event.pendingApprovalId,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
