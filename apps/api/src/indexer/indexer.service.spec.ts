import { describe, expect, it, vi } from 'vitest';
import type { ChainService } from '../chain/chain.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// Real ABI-log decoding isn't exercised in this file (see the comment in makeService) — the
// synthetic logs used in `tick()`-level tests are already shaped like decoded viem events, so
// parseEventLogs is mocked as a passthrough that hands the `logs` array straight through.
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    parseEventLogs: vi.fn(({ logs }: { logs: unknown[] }) => logs),
  };
});

import { IndexerService, cursorKeyFor } from './indexer.service.js';

/** Structural shape of the ChainService test double — just what makeService fills in. */
type MockChain = {
  handlerWalletAddress: string;
  chainId: number;
  handlerWalletAbi: unknown[];
  publicClient: {
    getBlockNumber: ReturnType<typeof vi.fn>;
    getLogs: ReturnType<typeof vi.fn>;
    getBlock: ReturnType<typeof vi.fn>;
    readContract: ReturnType<typeof vi.fn>;
  };
};

/** Structural shape of the PrismaService test double — just the models/methods the indexer
 * actually calls, plus a `$transaction` that runs the callback against this same object. */
type MockPrisma = {
  indexerCursor: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  wallet: { upsert: ReturnType<typeof vi.fn> };
  agent: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  policy: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  pendingApproval: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  activityEvent: { upsert: ReturnType<typeof vi.fn> };
  $transaction: (arg: unknown) => Promise<unknown>;
};

function makeService(overrides: {
  cursor?: { blockNumber: bigint } | null;
  latestBlock?: bigint;
  owner?: string;
  logs?: unknown[];
  existingCounterparty?: { id: string; name: string } | null;
  existingPolicy?: { id: string; sessionKey?: string } | null;
  existingPendingApproval?: Record<string, unknown> | null;
  pendingApprovalTuple?: readonly [
    string,
    string,
    `0x${string}`,
    bigint,
    bigint,
    boolean,
    number,
  ];
  policyTuple?: readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    boolean,
    boolean,
    boolean,
  ];
}) {
  const defaultPolicyTuple = [
    100_00000000n,
    50_00000000n,
    25_00000000n,
    0n,
    0n,
    1,
    true,
    false,
    false,
  ] as const;

  const chain: MockChain = {
    handlerWalletAddress: '0xAbCd000000000000000000000000000000dEaD',
    chainId: 31337,
    // Real ABI-log decoding isn't exercised here — parseEventLogs is mocked as a passthrough
    // (see top of file), and `logs` is already shaped like decoded viem events when a
    // `tick()`-level test needs one. The per-event handler tests call the private handleLog()
    // directly, bypassing parseEventLogs entirely.
    handlerWalletAbi: [],
    publicClient: {
      getBlockNumber: vi.fn().mockResolvedValue(overrides.latestBlock ?? 5n),
      getLogs: vi.fn().mockResolvedValue(overrides.logs ?? []),
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_700_000_000n }),
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'owner') {
          return Promise.resolve(
            overrides.owner ?? '0x0000000000000000000000000000000000f00d',
          );
        }
        if (functionName === 'policies') {
          return Promise.resolve(overrides.policyTuple ?? defaultPolicyTuple);
        }
        if (functionName === 'pendingApprovals') {
          return Promise.resolve(
            overrides.pendingApprovalTuple ?? [
              '0x1111111111111111111111111111111111aaaa',
              '0x3333333333333333333333333333333333cccc',
              '0xdeadbeef',
              20000000000000000n,
              20_00000000n,
              false,
              0, // CallKind.TRANSFER
            ],
          );
        }
        throw new Error(`Unexpected readContract call: ${functionName}`);
      }),
    },
  };

  const prisma: MockPrisma = {
    indexerCursor: {
      findUnique: vi.fn().mockResolvedValue(overrides.cursor ?? null),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    wallet: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      upsert: vi
        .fn()
        .mockResolvedValue({ id: 'agent_1', name: '0xabcd…dead' }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if ('address' in where) {
          return Promise.resolve(
            overrides.existingCounterparty === undefined
              ? null
              : overrides.existingCounterparty,
          );
        }
        // Looked up by id, e.g. Approved/Denied resolving names for the summary.
        if (where.id === 'agent_1') {
          return Promise.resolve({ id: 'agent_1', name: '0xabcd…dead' });
        }
        return Promise.resolve({ id: where.id, name: '0x3333…cccc' });
      }),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'agent_2', name: '0x3333…3333' }),
    },
    policy: {
      upsert: vi.fn().mockResolvedValue({ id: 'policy_1' }),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.existingPolicy === undefined
            ? { id: 'policy_1', sessionKey: SESSION_KEY }
            : overrides.existingPolicy,
        ),
    },
    pendingApproval: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.existingPendingApproval === undefined
            ? {
                id: '0xapproval1',
                walletAddress: WALLET,
                policyId: 'policy_1',
                agentId: 'agent_1',
                counterpartyAgentId: 'agent_9',
                amountUsd: 20_00000000n,
                target: '0x3333333333333333333333333333333333cccc',
              }
            : overrides.existingPendingApproval,
        ),
      update: vi.fn().mockResolvedValue(undefined),
    },
    activityEvent: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    // Interactive transactions in these tests just run the callback against this same mock
    // client — real atomicity isn't what's under test here (that's Prisma's own guarantee).
    // The closure over `prisma` is safe despite referencing the const before its statement
    // finishes: this function only runs later, once $transaction is actually invoked.
    $transaction: (arg: unknown) => {
      if (typeof arg === 'function')
        return (arg as (tx: MockPrisma) => Promise<unknown>)(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    },
  };

  const service = new IndexerService(
    chain as unknown as ChainService,
    prisma as unknown as PrismaService,
  );
  return { service, chain, prisma };
}

/** Structural view of IndexerService exposing just its private handleLog(), so the
 * per-event tests can call it directly without going through a full tick(). */
type HandleLogCapable = {
  handleLog: (
    db: unknown,
    log: unknown,
    walletAddress: string,
    blockTimestamps: Map<bigint, Date>,
  ) => Promise<void>;
};

function callHandleLog(service: IndexerService, prisma: unknown, log: unknown) {
  return (service as unknown as HandleLogCapable).handleLog(
    prisma,
    log,
    WALLET,
    new Map<bigint, Date>(),
  );
}

describe('cursorKeyFor', () => {
  it('lowercases the address', () => {
    expect(cursorKeyFor('0xABCD')).toBe('wallet:0xabcd');
  });
});

describe('IndexerService.tick', () => {
  it('bootstraps the Wallet + IndexerCursor rows when no cursor exists', async () => {
    const { service, chain, prisma } = makeService({ cursor: null });

    await service.tick();

    expect(prisma.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: chain.handlerWalletAddress.toLowerCase() },
        create: expect.objectContaining({
          address: chain.handlerWalletAddress.toLowerCase(),
          chainId: 31337,
          owner: '0x0000000000000000000000000000000000f00d',
          isDemo: true,
        }),
      }),
    );
    expect(prisma.indexerCursor.create).toHaveBeenCalledWith({
      data: { key: cursorKeyFor(chain.handlerWalletAddress), blockNumber: 0n },
    });
    expect(prisma.indexerCursor.update).not.toHaveBeenCalled();
  });

  it('advances an existing cursor to the latest block', async () => {
    const { service, prisma } = makeService({
      cursor: { blockNumber: 2n },
      latestBlock: 9n,
    });

    await service.tick();

    expect(prisma.wallet.upsert).not.toHaveBeenCalled();
    expect(prisma.indexerCursor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { blockNumber: 9n } }),
    );
  });

  it('does nothing when no new blocks exist', async () => {
    const { service, prisma } = makeService({
      cursor: { blockNumber: 9n },
      latestBlock: 9n,
    });

    await service.tick();

    expect(prisma.indexerCursor.update).not.toHaveBeenCalled();
  });

  it('never throws out of the cron tick, even when a step fails', async () => {
    const { service, prisma } = makeService({ cursor: { blockNumber: 0n } });
    prisma.indexerCursor.update.mockRejectedValueOnce(new Error('db down'));

    await expect(service.tick()).resolves.toBeUndefined();
  });

  const HIRED_LOG = {
    eventName: 'AgentHired',
    args: { sessionKey: '0x1111111111111111111111111111111111aaaa' },
    blockNumber: 3n,
    logIndex: 0,
    transactionHash: '0xtx-hired',
  };

  it('reprocessing the same block range upserts by the same natural key both times', async () => {
    // A real Postgres unique constraint (txHash, logIndex) is what actually prevents a
    // duplicate row; this test proves the code targets that same key on both runs, which
    // is what makes the upsert idempotent rather than a second insert.
    const { service, prisma } = makeService({
      cursor: { blockNumber: 2n },
      latestBlock: 3n,
      logs: [HIRED_LOG],
    });

    await service.tick();
    await service.tick();

    expect(prisma.activityEvent.upsert).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = prisma.activityEvent.upsert.mock.calls;
    expect(firstCall[0].where).toEqual(secondCall[0].where);
  });

  it('writes one ActivityEvent, not two, when Approved and Executed fire in the same tx', async () => {
    // approve() emits both Approved(id) and Executed(sessionKey, target, usdValue, kind)
    // in one transaction; the feed should show one row for the user's approval, not a
    // second "paid" row right behind it for the same action.
    const { service, prisma } = makeService({
      cursor: { blockNumber: 2n },
      latestBlock: 3n,
      logs: [
        {
          eventName: 'Approved',
          args: { id: '0xapproval1' },
          blockNumber: 3n,
          logIndex: 0,
          transactionHash: '0xtx-approve',
        },
        {
          eventName: 'Executed',
          args: {
            sessionKey: '0x1111111111111111111111111111111111aaaa',
            target: '0x3333333333333333333333333333333333cccc',
            usdValue: 20_00000000n,
            kind: 0,
          },
          blockNumber: 3n,
          logIndex: 1,
          transactionHash: '0xtx-approve',
        },
      ],
    });

    await service.tick();

    expect(prisma.activityEvent.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'APPROVED' }),
      }),
    );
  });

  it('does not advance the cursor when a step throws mid-batch', async () => {
    const { service, prisma } = makeService({
      cursor: { blockNumber: 2n },
      latestBlock: 3n,
      logs: [HIRED_LOG],
    });
    prisma.activityEvent.upsert.mockRejectedValueOnce(new Error('write failed'));

    await service.tick();

    expect(prisma.indexerCursor.update).not.toHaveBeenCalled();
  });

  it('ignores a concurrent tick() while one is already running', async () => {
    const { service, chain, prisma } = makeService({
      cursor: { blockNumber: 2n },
      latestBlock: 3n,
      logs: [HIRED_LOG],
    });
    let resolveCursorLookup!: (value: { blockNumber: bigint }) => void;
    prisma.indexerCursor.findUnique.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCursorLookup = resolve;
      }),
    );

    const firstTick = service.tick();
    const secondTick = service.tick(); // must no-op: the first tick hasn't resolved yet

    resolveCursorLookup({ blockNumber: 2n });
    await Promise.all([firstTick, secondTick]);

    expect(chain.publicClient.getBlockNumber).toHaveBeenCalledTimes(1);
  });
});

const WALLET = '0xabcd000000000000000000000000000000dead';
const SESSION_KEY = '0x1111111111111111111111111111111111aaaa';

describe('IndexerService (private) handleLog', () => {
  it('AgentHired: creates a HIRED agent, refreshes the policy mirror, writes a HIRED activity row', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'AgentHired',
      args: { sessionKey: SESSION_KEY },
      blockNumber: 3n,
      logIndex: 1,
      transactionHash: '0xtx1',
    });

    expect(prisma.agent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: SESSION_KEY },
        update: { kind: 'HIRED' },
        create: expect.objectContaining({
          address: SESSION_KEY,
          kind: 'HIRED',
        }),
      }),
    );
    expect(prisma.policy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletAddress_sessionKey: {
            walletAddress: WALLET,
            sessionKey: SESSION_KEY,
          },
        },
      }),
    );
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          walletAddress: WALLET,
          agentId: 'agent_1',
          policyId: 'policy_1',
          type: 'HIRED',
          source: 'CHAIN',
          txHash: '0xtx1',
          logIndex: 1,
          blockNumber: 3n,
        }),
      }),
    );
  });

  it('PolicyUpdated: refreshes the policy mirror and writes a POLICY_UPDATED activity row', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'PolicyUpdated',
      args: { sessionKey: SESSION_KEY },
      blockNumber: 4n,
      logIndex: 0,
      transactionHash: '0xtx2',
    });

    expect(prisma.policy.upsert).toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'POLICY_UPDATED' }),
      }),
    );
  });

  it('AgentFrozen(true): writes a FROZEN row and sets frozenAt', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'AgentFrozen',
      args: { sessionKey: SESSION_KEY, frozen: true },
      blockNumber: 5n,
      logIndex: 0,
      transactionHash: '0xtx3',
    });

    expect(prisma.policy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ frozenAt: expect.any(Date) }),
      }),
    );
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'FROZEN' }),
      }),
    );
  });

  it('AgentFrozen(false): writes an UNFROZEN row and clears frozenAt', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'AgentFrozen',
      args: { sessionKey: SESSION_KEY, frozen: false },
      blockNumber: 6n,
      logIndex: 0,
      transactionHash: '0xtx4',
    });

    expect(prisma.policy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ frozenAt: null }) }),
    );
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'UNFROZEN' }),
      }),
    );
  });

  const TARGET = '0x3333333333333333333333333333333333cccc';

  it('Executed(SWAP): writes a SWAP row with no counterparty agent', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'Executed',
      args: { sessionKey: SESSION_KEY, target: TARGET, usdValue: 20_00000000n, kind: 1 },
      blockNumber: 8n,
      logIndex: 0,
      transactionHash: '0xtx6',
    });

    expect(prisma.agent.findUnique).not.toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'SWAP',
          counterpartyAgentId: null,
          amountUsd: 20_00000000n,
        }),
      }),
    );
  });

  it('Executed(TRANSFER) to a new address: auto-vivifies COUNTERPARTY, classifies TRANSFER', async () => {
    const { service, prisma } = makeService({ existingCounterparty: null });

    await callHandleLog(service, prisma, {
      eventName: 'Executed',
      args: { sessionKey: SESSION_KEY, target: TARGET, usdValue: 20_00000000n, kind: 0 },
      blockNumber: 8n,
      logIndex: 0,
      transactionHash: '0xtx7',
    });

    expect(prisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ address: TARGET, kind: 'COUNTERPARTY' }),
      }),
    );
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'TRANSFER',
          counterpartyAgentId: 'agent_2',
        }),
      }),
    );
  });

  it('Executed(TRANSFER) to an already-catalogued agent: classifies AGENT_PAYMENT', async () => {
    const { service, prisma } = makeService({
      existingCounterparty: { id: 'agent_9', name: 'Atlas' },
    });

    await callHandleLog(service, prisma, {
      eventName: 'Executed',
      args: { sessionKey: SESSION_KEY, target: TARGET, usdValue: 20_00000000n, kind: 0 },
      blockNumber: 8n,
      logIndex: 0,
      transactionHash: '0xtx8',
    });

    expect(prisma.agent.create).not.toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'AGENT_PAYMENT',
          counterpartyAgentId: 'agent_9',
        }),
      }),
    );
  });

  it('ExecutionBlocked: maps the reason enum and writes a BLOCKED row', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'ExecutionBlocked',
      args: { sessionKey: SESSION_KEY, reason: 3, usdValue: 0n },
      blockNumber: 9n,
      logIndex: 0,
      transactionHash: '0xtx9',
    });

    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'BLOCKED',
          blockReason: 'COUNTERPARTY_BELOW_TIER',
        }),
      }),
    );
  });

  const APPROVAL_ID = '0xapproval1';
  const TARGET2 = '0x3333333333333333333333333333333333cccc';

  it('Proposed: reads calldata through, creates a PendingApproval + PENDING row', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'Proposed',
      args: {
        id: APPROVAL_ID,
        sessionKey: SESSION_KEY,
        target: TARGET2,
        value: 20000000000000000n,
        usdValue: 20_00000000n,
      },
      blockNumber: 10n,
      logIndex: 0,
      transactionHash: '0xtx10',
    });

    expect(prisma.pendingApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: APPROVAL_ID,
          walletAddress: WALLET,
          calldata: '0xdeadbeef',
          amountUsd: 20_00000000n,
          status: 'PENDING',
        }),
      }),
    );
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'PENDING',
          pendingApprovalId: APPROVAL_ID,
        }),
      }),
    );
  });

  it('Proposed: a call proposed with CallKind.SWAP is classified as a swap, not a payment', async () => {
    const { service, prisma } = makeService({
      pendingApprovalTuple: [
        SESSION_KEY,
        TARGET2,
        '0xswapcalldata',
        20000000000000000n,
        20_00000000n,
        false,
        1, // CallKind.SWAP
      ],
    });

    await callHandleLog(service, prisma, {
      eventName: 'Proposed',
      args: {
        id: APPROVAL_ID,
        sessionKey: SESSION_KEY,
        target: TARGET2,
        value: 20000000000000000n,
        usdValue: 20_00000000n,
      },
      blockNumber: 10n,
      logIndex: 0,
      transactionHash: '0xtx10c',
    });

    expect(prisma.agent.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: TARGET2 } }),
    );
    expect(prisma.agent.create).not.toHaveBeenCalled();
    expect(prisma.pendingApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          counterpartyAgentId: null,
          summary: expect.stringContaining('swap'),
        }),
      }),
    );
  });

  it('Proposed: skips gracefully when no Policy mirror exists yet', async () => {
    const { service, prisma } = makeService({ existingPolicy: null });

    await callHandleLog(service, prisma, {
      eventName: 'Proposed',
      args: {
        id: APPROVAL_ID,
        sessionKey: SESSION_KEY,
        target: TARGET2,
        value: 1n,
        usdValue: 1n,
      },
      blockNumber: 10n,
      logIndex: 0,
      transactionHash: '0xtx10b',
    });

    expect(prisma.pendingApproval.upsert).not.toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).not.toHaveBeenCalled();
  });

  it('Approved: resolves the PendingApproval, refreshes the policy mirror, writes an APPROVED row', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'Approved',
      args: { id: APPROVAL_ID },
      blockNumber: 11n,
      logIndex: 0,
      transactionHash: '0xtx11',
    });

    expect(prisma.pendingApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: APPROVAL_ID },
        data: expect.objectContaining({
          status: 'APPROVED',
          resolutionSource: 'CHAIN',
        }),
      }),
    );
    expect(prisma.policy.upsert).toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'APPROVED',
          pendingApprovalId: APPROVAL_ID,
        }),
      }),
    );
  });

  it('Denied: resolves the PendingApproval, writes a DENIED row, never touches the policy mirror', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'Denied',
      args: { id: APPROVAL_ID },
      blockNumber: 12n,
      logIndex: 0,
      transactionHash: '0xtx12',
    });

    expect(prisma.pendingApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DENIED' }),
      }),
    );
    expect(prisma.policy.upsert).not.toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DENIED' }),
      }),
    );
  });

  it('Approved: falls back to the policy session key, not the target address, when the acting Agent row is missing', async () => {
    const policySessionKey = '0x2222222222222222222222222222222222bbbb';
    const { service, prisma } = makeService({
      existingPolicy: { id: 'policy_1', sessionKey: policySessionKey },
    });
    prisma.agent.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; address?: string } }) => {
        if (where.id === 'agent_1') return Promise.resolve(null); // missing acting agent
        return Promise.resolve({ id: where.id, name: '0x3333…cccc' });
      },
    );

    await callHandleLog(service, prisma, {
      eventName: 'Approved',
      args: { id: APPROVAL_ID },
      blockNumber: 13n,
      logIndex: 0,
      transactionHash: '0xtx13',
    });

    expect(prisma.activityEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          summary: expect.stringContaining('0x2222…bbbb'),
        }),
      }),
    );
  });

  it('Approved/Denied: skips gracefully when no PendingApproval row exists', async () => {
    const { service, prisma } = makeService({ existingPendingApproval: null });

    await callHandleLog(service, prisma, {
      eventName: 'Approved',
      args: { id: APPROVAL_ID },
      blockNumber: 13n,
      logIndex: 0,
      transactionHash: '0xtx13',
    });

    expect(prisma.pendingApproval.update).not.toHaveBeenCalled();
    expect(prisma.activityEvent.upsert).not.toHaveBeenCalled();
  });

  it('ignores an unrecognized event name (default branch)', async () => {
    const { service, prisma } = makeService({});

    await callHandleLog(service, prisma, {
      eventName: 'SomeFutureEvent',
      args: {},
      blockNumber: 7n,
      logIndex: 0,
      transactionHash: '0xtx5',
    });

    expect(prisma.activityEvent.upsert).not.toHaveBeenCalled();
  });
});
