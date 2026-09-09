import { describe, expect, it, vi } from 'vitest';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AgentsService } from '../agents/agents.service.js';
import type { VillainService } from './villain.service.js';
import type { ChainService } from '../chain/chain.service.js';
import { DemoRunStatus } from '../generated/prisma/enums.js';
import type { DemoEnv } from './demo.config.js';
import { DemoService, RESET_BEAT, isBeatNumber } from './demo.service.js';

const OWNER = '0xAAaAaAAAAaaaAaAAaAaaAAAAAaAAaAAaAaAAAAAa';
const WALLET_ADDRESS = '0xwallet00000000000000000000000000000000';
const RILEY_PAYMENT_WEI = 100000000000000n;
const COSIGN_PAYMENT_WEI = 20000000000000000n;

const ENV: DemoEnv = {
  enabled: true,
  DEMO_TOKEN: 'a-long-enough-demo-token',
  DEMO_OWNER_ADDRESS: OWNER,
  DEMO_COSIGN_PAYMENT_WEI: COSIGN_PAYMENT_WEI,
};

function makePrisma() {
  const prisma = {
    wallet: { update: vi.fn(async () => ({})) },
    demoRun: {
      create: vi.fn(async () => ({ id: 'demo-run-1' })),
      update: vi.fn(async (args: { data: unknown }) => args.data),
    },
    activityEvent: { deleteMany: vi.fn(async () => ({ count: 7 })) },
    pendingApproval: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    intent: { deleteMany: vi.fn(async () => ({ count: 3 })) },
    indexerCursor: { upsert: vi.fn(async () => ({})) },
    policy: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    /** Runs the callback against the same double, so call-order assertions
     * see every write the transaction made. */
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  return prisma;
}

function makeChain(blockNumber = 12345678n) {
  return { publicClient: { getBlockNumber: vi.fn(async () => blockNumber) } };
}

function makeAgents(walletAddress: string | null = WALLET_ADDRESS) {
  return {
    walletAddressForOwner: vi.fn(async () => walletAddress),
    payWalletForDemo: vi.fn(async () => undefined),
    paymentWei: RILEY_PAYMENT_WEI,
  };
}

function makeVillain() {
  return { attemptForDemo: vi.fn(async () => undefined) };
}

function makeService(
  prisma = makePrisma(),
  agents = makeAgents(),
  villain = makeVillain(),
  env: DemoEnv = ENV,
  chain = makeChain(),
) {
  const service = new DemoService(
    prisma as unknown as PrismaService,
    agents as unknown as AgentsService,
    villain as unknown as VillainService,
    chain as unknown as ChainService,
    env,
  );
  return { service, prisma, agents, villain, chain };
}

describe('isBeatNumber', () => {
  it('accepts only 1, 2 and 3', () => {
    expect([1, 2, 3].every(isBeatNumber)).toBe(true);
    expect([0, 4, -1, 1.5].some(isBeatNumber)).toBe(false);
  });
});

describe('DemoService.runBeat', () => {
  it('beat 1 pays the Subcontractor at Riley’s configured amount', async () => {
    const { service, agents, villain } = makeService();

    await service.runBeat(1);

    expect(agents.payWalletForDemo).toHaveBeenCalledWith({
      walletAddress: WALLET_ADDRESS,
      valueWei: RILEY_PAYMENT_WEI,
      demoRunId: 'demo-run-1',
    });
    expect(villain.attemptForDemo).not.toHaveBeenCalled();
  });

  it('beat 2 sends the villain, and never routes through Riley', async () => {
    const { service, agents, villain } = makeService();

    await service.runBeat(2);

    expect(villain.attemptForDemo).toHaveBeenCalledWith({
      walletAddress: WALLET_ADDRESS,
      demoRunId: 'demo-run-1',
    });
    expect(agents.payWalletForDemo).not.toHaveBeenCalled();
  });

  it('beat 3 is the same call as beat 1 at the co-sign amount', async () => {
    const { service, agents } = makeService();

    await service.runBeat(3);

    expect(agents.payWalletForDemo).toHaveBeenCalledWith({
      walletAddress: WALLET_ADDRESS,
      valueWei: COSIGN_PAYMENT_WEI,
      demoRunId: 'demo-run-1',
    });
  });

  it('creates the run RUNNING before acting, then marks it SUCCEEDED', async () => {
    const { service, prisma } = makeService();

    const run = await service.runBeat(1);

    const created = prisma.demoRun.create.mock.calls[0][0] as {
      data: { beat: number; status: string };
    };
    expect(created.data).toMatchObject({ beat: 1, status: DemoRunStatus.RUNNING });
    expect(run).toMatchObject({ status: DemoRunStatus.SUCCEEDED });
    expect((run as { finishedAt: Date }).finishedAt).toBeInstanceOf(Date);
  });

  it('records a beat failure on the run and returns it, rather than throwing', async () => {
    const agents = makeAgents();
    agents.payWalletForDemo = vi.fn(async () => {
      throw new Error("Riley hasn't been hired by the showcase wallet yet");
    });
    const { service, prisma } = makeService(makePrisma(), agents);

    const run = await service.runBeat(1);

    expect(run).toMatchObject({
      status: DemoRunStatus.FAILED,
      error: expect.stringContaining("hasn't been hired"),
    });
    const log = (prisma.demoRun.update.mock.calls[0][0] as { data: { log: string[] } })
      .data.log;
    expect(log.at(-1)).toMatch(/Failed:/);
  });

  it('422s when the showcase owner has no wallet yet, without creating a run', async () => {
    const { service, prisma } = makeService(makePrisma(), makeAgents(null));

    await expect(service.runBeat(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.demoRun.create).not.toHaveBeenCalled();
  });

  it('resolves the showcase wallet by lowercased owner and flags it isDemo', async () => {
    const { service, prisma, agents } = makeService();

    await service.runBeat(1);

    expect(agents.walletAddressForOwner).toHaveBeenCalledWith(
      OWNER.toLowerCase(),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { address: WALLET_ADDRESS },
      data: { isDemo: true },
    });
  });

  it('409s a second beat while the first is still in flight', async () => {
    const agents = makeAgents();
    let release: () => void = () => {};
    agents.payWalletForDemo = vi.fn(
      () => new Promise<undefined>((resolve) => {
        release = () => resolve(undefined);
      }),
    );
    const { service } = makeService(makePrisma(), agents);

    const first = service.runBeat(1);
    await expect(service.runBeat(2)).rejects.toThrow(ConflictException);

    release();
    await first;
  });

  it('releases the guard once a beat finishes, including a failed one', async () => {
    const agents = makeAgents();
    agents.payWalletForDemo = vi.fn(async () => {
      throw new Error('boom');
    });
    const { service } = makeService(makePrisma(), agents);

    await service.runBeat(1);
    await expect(service.runBeat(1)).resolves.toMatchObject({
      status: DemoRunStatus.FAILED,
    });
  });

  it('422s every beat when the director is disabled, without acting', async () => {
    const { service, prisma, agents, villain } = makeService(
      makePrisma(),
      makeAgents(),
      makeVillain(),
      { enabled: false },
    );

    for (const beat of [1, 2, 3] as const) {
      await expect(service.runBeat(beat)).rejects.toThrow(
        UnprocessableEntityException,
      );
    }
    expect(agents.payWalletForDemo).not.toHaveBeenCalled();
    expect(villain.attemptForDemo).not.toHaveBeenCalled();
    expect(prisma.demoRun.create).not.toHaveBeenCalled();
  });

  it('releases the guard after a pre-flight throw', async () => {
    const { service } = makeService(makePrisma(), makeAgents(null));

    await expect(service.runBeat(1)).rejects.toThrow();
    await expect(service.runBeat(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('DemoService.reset', () => {
  const WALLET = { walletAddress: WALLET_ADDRESS };

  it('deletes only the showcase wallet’s rows, on all three feed tables', async () => {
    const { service, prisma } = makeService();

    await service.reset();

    expect(prisma.activityEvent.deleteMany).toHaveBeenCalledWith({ where: WALLET });
    expect(prisma.pendingApproval.deleteMany).toHaveBeenCalledWith({ where: WALLET });
    expect(prisma.intent.deleteMany).toHaveBeenCalledWith({ where: WALLET });
  });

  it('never issues an unscoped deleteMany — the one unrecoverable mistake here', async () => {
    const { service, prisma } = makeService();

    await service.reset();

    for (const table of [
      prisma.activityEvent,
      prisma.pendingApproval,
      prisma.intent,
    ]) {
      for (const call of table.deleteMany.mock.calls) {
        const args = call[0] as { where?: { walletAddress?: string } };
        expect(args?.where?.walletAddress).toBe(WALLET_ADDRESS);
      }
    }
  });

  it('deletes child-first: ActivityEvent before PendingApproval before Intent', async () => {
    const { service, prisma } = makeService();

    await service.reset();

    const order = [
      prisma.activityEvent.deleteMany.mock.invocationCallOrder[0],
      prisma.pendingApproval.deleteMany.mock.invocationCallOrder[0],
      prisma.intent.deleteMany.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('jumps this wallet’s cursor to the current block, not to its creation block', async () => {
    const { service, prisma } = makeService(
      makePrisma(),
      makeAgents(),
      makeVillain(),
      ENV,
      makeChain(999n),
    );

    await service.reset();

    expect(prisma.indexerCursor.upsert).toHaveBeenCalledWith({
      where: { key: `wallet:${WALLET_ADDRESS}` },
      update: { blockNumber: 999n },
      create: { key: `wallet:${WALLET_ADDRESS}`, blockNumber: 999n },
    });
  });

  it('reads the block number before opening the transaction', async () => {
    const { service, prisma, chain } = makeService();

    await service.reset();

    expect(
      chain.publicClient.getBlockNumber.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
  });

  it('does the deletes and the cursor write in one transaction', async () => {
    const { service, prisma } = makeService();

    await service.reset();

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('never deletes policies, agents, wallets or demo runs', async () => {
    const { service, prisma } = makeService();

    await service.reset();

    expect(prisma.policy.deleteMany).not.toHaveBeenCalled();
    expect(prisma.demoRun.create).toHaveBeenCalledOnce();
  });

  it('records a beat-0 run that succeeds with per-table counts in the log', async () => {
    const { service, prisma } = makeService();

    const run = await service.reset();

    const created = prisma.demoRun.create.mock.calls[0][0] as {
      data: { beat: number; status: string };
    };
    expect(created.data).toMatchObject({
      beat: RESET_BEAT,
      status: DemoRunStatus.RUNNING,
    });
    expect(run).toMatchObject({ status: DemoRunStatus.SUCCEEDED });
    const log = (run as { log: string[] }).log;
    expect(log.join(' ')).toMatch(/7 activity rows, 2 pending approvals, 3 intents/);
  });

  it('succeeds with zero counts on a wallet that has no rows yet', async () => {
    const prisma = makePrisma();
    prisma.activityEvent.deleteMany = vi.fn(async () => ({ count: 0 }));
    prisma.pendingApproval.deleteMany = vi.fn(async () => ({ count: 0 }));
    prisma.intent.deleteMany = vi.fn(async () => ({ count: 0 }));
    const { service } = makeService(prisma);

    const run = await service.reset();

    expect(run).toMatchObject({ status: DemoRunStatus.SUCCEEDED });
    expect(prisma.indexerCursor.upsert).toHaveBeenCalledOnce();
  });

  it('is safe to mash: two resets back to back both succeed', async () => {
    const { service } = makeService();

    await expect(service.reset()).resolves.toMatchObject({
      status: DemoRunStatus.SUCCEEDED,
    });
    await expect(service.reset()).resolves.toMatchObject({
      status: DemoRunStatus.SUCCEEDED,
    });
  });

  it('records an RPC failure as a FAILED run, having deleted nothing', async () => {
    const chain = {
      publicClient: {
        getBlockNumber: vi.fn(async () => {
          throw new Error('rpc down');
        }),
      },
    };
    const { service, prisma } = makeService(
      makePrisma(),
      makeAgents(),
      makeVillain(),
      ENV,
      chain,
    );

    const run = await service.reset();

    expect(run).toMatchObject({
      status: DemoRunStatus.FAILED,
      error: expect.stringContaining('rpc down'),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.activityEvent.deleteMany).not.toHaveBeenCalled();
  });

  it('422s when the showcase owner has no wallet, without creating a run', async () => {
    const { service, prisma } = makeService(makePrisma(), makeAgents(null));

    await expect(service.reset()).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.demoRun.create).not.toHaveBeenCalled();
  });

  it('409s a reset while a beat is in flight, and a beat while a reset is', async () => {
    const agents = makeAgents();
    let release: () => void = () => {};
    agents.payWalletForDemo = vi.fn(
      () => new Promise<undefined>((resolve) => {
        release = () => resolve(undefined);
      }),
    );
    const { service } = makeService(makePrisma(), agents);

    const beat = service.runBeat(1);
    await expect(service.reset()).rejects.toThrow(ConflictException);
    release();
    await beat;

    const prismaSlow = makePrisma();
    let releaseTx: () => void = () => {};
    prismaSlow.$transaction = vi.fn(
      () => new Promise((resolve) => {
        releaseTx = () => resolve({ activity: 0, approvals: 0, intents: 0 });
      }),
    );
    const second = makeService(prismaSlow);
    const resetting = second.service.reset();
    await expect(second.service.runBeat(1)).rejects.toThrow(ConflictException);
    releaseTx();
    await resetting;
  });
});
