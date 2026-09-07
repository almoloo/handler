import { describe, expect, it, vi } from 'vitest';
import { ActivityService, type ActivityEventFields } from './activity.service.js';
import { ActivityType, ActivitySource } from '../generated/prisma/enums.js';

function makeService(prisma: unknown = {}) {
  return new ActivityService(prisma as never);
}

const BASE_EVENT: ActivityEventFields = {
  id: 'event-1',
  seq: 42n,
  type: ActivityType.SWAP,
  source: ActivitySource.CHAIN,
  blockReason: null,
  amountUsd: 50_00000000n,
  tokenAddress: '0xtoken',
  tokenAmountRaw: { toString: () => '1000000' },
  target: '0xtarget',
  txHash: '0xtxhash',
  summary: 'Riley swapped $50.00',
  detail: { route: 'via 1inch' },
  pendingApprovalId: null,
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  agent: { id: 'agent-1', name: 'Riley', avatar: null },
  counterparty: null,
};

function eventAt(seq: bigint): ActivityEventFields {
  return { ...BASE_EVENT, id: `event-${seq}`, seq };
}

describe('ActivityService.parseFilter', () => {
  it('maps "all" to no filter (undefined)', () => {
    expect(makeService().parseFilter('all')).toBeUndefined();
  });

  it('maps "blocked" to ActivityType.BLOCKED', () => {
    expect(makeService().parseFilter('blocked')).toBe(ActivityType.BLOCKED);
  });

  it('maps "pending" to ActivityType.PENDING', () => {
    expect(makeService().parseFilter('pending')).toBe(ActivityType.PENDING);
  });

  it('throws BadRequestException on an unknown filter value', () => {
    expect(() => makeService().parseFilter('nonsense')).toThrow(/Invalid filter/);
  });
});

describe('ActivityService.mapToItem', () => {
  it('converts every BigInt/Decimal field to a string', () => {
    const item = makeService().mapToItem(BASE_EVENT);
    expect(item.seq).toBe('42');
    expect(item.amountUsd).toBe('5000000000');
    expect(item.tokenAmountRaw).toBe('1000000');
    expect(item.createdAt).toBe('2026-09-08T00:00:00.000Z');
  });

  it('passes through detail verbatim (e.g. swap route metadata)', () => {
    const item = makeService().mapToItem(BASE_EVENT);
    expect(item.detail).toEqual({ route: 'via 1inch' });
  });

  it('resolves the agent relation to an ActivityAgentRef', () => {
    const item = makeService().mapToItem(BASE_EVENT);
    expect(item.agent).toEqual({ id: 'agent-1', name: 'Riley', avatar: null });
  });

  it('resolves a null counterparty to null (not an error)', () => {
    const item = makeService().mapToItem(BASE_EVENT);
    expect(item.counterparty).toBeNull();
  });

  it('resolves null amountUsd/tokenAmountRaw to null, not "null"', () => {
    const item = makeService().mapToItem({
      ...BASE_EVENT,
      amountUsd: null,
      tokenAmountRaw: null,
    });
    expect(item.amountUsd).toBeNull();
    expect(item.tokenAmountRaw).toBeNull();
  });
});

describe('ActivityService.pollNewEvents', () => {
  it('returns no items and an unchanged cursor when nothing new arrived', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = makeService({ activityEvent: { findMany } });

    const result = await service.pollNewEvents('0xwallet', 42n);

    expect(result).toEqual({ items: [], nextSeq: 42n });
  });

  it('advances the cursor to the highest seq seen and maps every row', async () => {
    const rows = [eventAt(43n), eventAt(44n)];
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = makeService({ activityEvent: { findMany } });

    const result = await service.pollNewEvents('0xwallet', 42n);

    expect(result.nextSeq).toBe(44n);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].seq).toBe('43');
    expect(result.items[1].seq).toBe('44');
  });

  it('scopes the query to the given wallet and to seq greater than the cursor', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = makeService({ activityEvent: { findMany } });

    await service.pollNewEvents('0xwallet', 42n);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletAddress: '0xwallet', seq: { gt: 42n } },
        orderBy: { seq: 'asc' },
      }),
    );
  });
});

describe('ActivityService.resolveStartingCursor', () => {
  it('resumes from a valid Last-Event-ID without touching the database', async () => {
    const findFirst = vi.fn();
    const service = makeService({ activityEvent: { findFirst } });

    const cursor = await service.resolveStartingCursor('0xwallet', '42');

    expect(cursor).toBe(42n);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the wallet\'s latest seq when Last-Event-ID is malformed', async () => {
    const findFirst = vi.fn().mockResolvedValue({ seq: 99n });
    const service = makeService({ activityEvent: { findFirst } });

    const cursor = await service.resolveStartingCursor('0xwallet', 'not-a-number');

    expect(cursor).toBe(99n);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletAddress: '0xwallet' },
        orderBy: { seq: 'desc' },
      }),
    );
  });

  it('starts from the wallet\'s latest seq when no Last-Event-ID is given', async () => {
    const findFirst = vi.fn().mockResolvedValue({ seq: 7n });
    const service = makeService({ activityEvent: { findFirst } });

    const cursor = await service.resolveStartingCursor('0xwallet');

    expect(cursor).toBe(7n);
  });

  it('starts from 0 when the wallet has no activity yet', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = makeService({ activityEvent: { findFirst } });

    const cursor = await service.resolveStartingCursor('0xwallet');

    expect(cursor).toBe(0n);
  });
});
