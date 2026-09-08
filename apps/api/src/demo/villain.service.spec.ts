import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChainService } from '../chain/chain.service.js';
import { AgentKind, IntentStatus } from '../generated/prisma/enums.js';
import { VillainService } from './villain.service.js';

/** Structural shape of the PrismaService test double — just what VillainService calls. */
type MockPrisma = {
  agent: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  policy: { findMany: ReturnType<typeof vi.fn> };
  intent: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): MockPrisma {
  return {
    agent: { upsert: vi.fn(async () => ({})), findUnique: vi.fn() },
    policy: { findMany: vi.fn(async () => []) },
    intent: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'intent-1' })),
      update: vi.fn(async () => ({})),
    },
  };
}

/** Structural shape of the ChainService test double — just what VillainService calls. */
type MockChain = {
  publicClient: {
    waitForTransactionReceipt: ReturnType<typeof vi.fn>;
  };
  handlerWalletAbi: unknown;
};

function makeChain(): MockChain {
  return {
    publicClient: {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
    },
    handlerWalletAbi: [],
  };
}

const VILLAIN_SESSION_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff81';
const VILLAIN_PAYMENT_WEI = '500000000000000000';
const VILLAIN_TARGET_ADDRESS = '0xdddddddddddddddddddddddddddddddddddddddd';
const WALLET_ADDRESS = '0xwallet00000000000000000000000000000000';
const VILLAIN_AGENT_ID = 'villain-agent-1';

beforeEach(() => {
  process.env.VILLAIN_SESSION_KEY = VILLAIN_SESSION_KEY;
  process.env.VILLAIN_PAYMENT_WEI = VILLAIN_PAYMENT_WEI;
  process.env.VILLAIN_TARGET_ADDRESS = VILLAIN_TARGET_ADDRESS;
});

afterEach(() => {
  delete process.env.VILLAIN_SESSION_KEY;
  delete process.env.VILLAIN_PAYMENT_WEI;
  delete process.env.VILLAIN_TARGET_ADDRESS;
  vi.restoreAllMocks();
});

function makeService(prisma: MockPrisma, chain: MockChain = makeChain()) {
  return new VillainService(
    prisma as unknown as PrismaService,
    chain as unknown as ChainService,
  );
}

/** Wires the mocks a `run()` call needs to reach `payWallet` for one wallet:
 * the villain's own `Agent` row and one non-frozen `Policy`. `epochStart`
 * defaults to now, so the epoch is fresh. */
function primeForOneWallet(
  prisma: MockPrisma,
  overrides: { epochStart?: bigint } = {},
) {
  prisma.agent.findUnique.mockResolvedValueOnce({ id: VILLAIN_AGENT_ID });
  prisma.policy.findMany.mockResolvedValueOnce([
    {
      id: 'policy-1',
      walletAddress: WALLET_ADDRESS,
      epochStart: overrides.epochStart ?? BigInt(Math.floor(Date.now() / 1000)),
    },
  ]);
}

describe('VillainService', () => {
  it("derives the villain's address from the session key, never storing the key itself", () => {
    const service = makeService(makePrisma());
    const expected = privateKeyToAccount(VILLAIN_SESSION_KEY).address;
    expect(service.villainAddress).toBe(expected);
  });

  it('self-registers the villain as a lowercase-addressed VILLAIN agent on boot', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await service.onModuleInit();

    expect(prisma.agent.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.agent.upsert.mock.calls[0][0];
    expect(call.where.address).toBe(service.villainAddress.toLowerCase());
    expect(call.create.kind).toBe(AgentKind.VILLAIN);
    expect(call.create.keyEnvVar).toBe('VILLAIN_SESSION_KEY');
    expect(call.update.kind).toBe(AgentKind.VILLAIN);
  });

  it('throws a clear error when VILLAIN_SESSION_KEY is unset', () => {
    delete process.env.VILLAIN_SESSION_KEY;
    expect(() => makeService(makePrisma())).toThrow(/Invalid villain environment/);
  });

  describe('run', () => {
    it('skips a wallet that already attempted this epoch, without writing a new Intent', async () => {
      const prisma = makePrisma();
      primeForOneWallet(prisma);
      prisma.intent.findFirst.mockResolvedValueOnce({ id: 'existing-intent' });
      const chain = makeChain();
      const service = makeService(prisma, chain);
      vi.spyOn(service.villainWalletClient, 'writeContract');

      await service.run();

      expect(prisma.intent.create).not.toHaveBeenCalled();
      expect(service.villainWalletClient.writeContract).not.toHaveBeenCalled();
    });

    it('attempts a fresh wallet: writes an Intent, calls tryExecute against VILLAIN_TARGET_ADDRESS, marks it SUBMITTED', async () => {
      const prisma = makePrisma();
      primeForOneWallet(prisma);
      const chain = makeChain();
      const service = makeService(prisma, chain);
      const txHash = '0xabc123';
      vi.spyOn(service.villainWalletClient, 'writeContract').mockResolvedValue(
        txHash as `0x${string}`,
      );

      await service.run();

      expect(prisma.intent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletAddress: WALLET_ADDRESS,
          policyId: 'policy-1',
          agentId: VILLAIN_AGENT_ID,
          target: VILLAIN_TARGET_ADDRESS.toLowerCase(),
          valueRaw: VILLAIN_PAYMENT_WEI,
          calldata: '0x',
          status: IntentStatus.PLANNED,
        }),
      });
      expect(service.villainWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: WALLET_ADDRESS,
          functionName: 'tryExecute',
          args: [
            {
              target: VILLAIN_TARGET_ADDRESS,
              data: '0x',
              value: BigInt(VILLAIN_PAYMENT_WEI),
            },
          ],
        }),
      );
      expect(prisma.intent.update).toHaveBeenCalledWith({
        where: { id: 'intent-1' },
        data: expect.objectContaining({
          status: IntentStatus.SUBMITTED,
          txHash,
        }),
      });
      expect(chain.publicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
        { hash: txHash },
      );
    });

    it('marks the Intent FAILED, without stopping the loop, when the write throws before a tx hash exists', async () => {
      const prisma = makePrisma();
      // Two wallets: the first's write throws, the second should still run.
      prisma.agent.findUnique.mockResolvedValueOnce({ id: VILLAIN_AGENT_ID });
      const epochStart = BigInt(Math.floor(Date.now() / 1000));
      prisma.policy.findMany.mockResolvedValueOnce([
        { id: 'policy-1', walletAddress: WALLET_ADDRESS, epochStart },
        { id: 'policy-2', walletAddress: '0xwallet2', epochStart },
      ]);
      prisma.intent.create
        .mockResolvedValueOnce({ id: 'intent-1' })
        .mockResolvedValueOnce({ id: 'intent-2' });
      const chain = makeChain();
      const service = makeService(prisma, chain);
      vi.spyOn(service.villainWalletClient, 'writeContract')
        .mockRejectedValueOnce(new Error('rpc error'))
        .mockResolvedValueOnce('0xdef456' as `0x${string}`);

      await service.run();

      expect(prisma.intent.update).toHaveBeenCalledWith({
        where: { id: 'intent-1' },
        data: { status: IntentStatus.FAILED, error: 'Error: rpc error' },
      });
      // The second wallet still got its own Intent + submit — the first
      // wallet's failure didn't stop the loop.
      expect(prisma.intent.create).toHaveBeenCalledTimes(2);
      expect(prisma.intent.update).toHaveBeenCalledWith({
        where: { id: 'intent-2' },
        data: expect.objectContaining({ status: IntentStatus.SUBMITTED }),
      });
    });

    it('marks the Intent FAILED when a broadcast tx reverts on-chain (e.g. insufficient wallet balance)', async () => {
      const prisma = makePrisma();
      primeForOneWallet(prisma);
      const chain = makeChain();
      chain.publicClient.waitForTransactionReceipt.mockResolvedValueOnce({
        status: 'reverted',
      });
      const service = makeService(prisma, chain);
      vi.spyOn(service.villainWalletClient, 'writeContract').mockResolvedValue(
        '0xabc123' as `0x${string}`,
      );

      await service.run();

      expect(prisma.intent.update).toHaveBeenCalledWith({
        where: { id: 'intent-1' },
        data: {
          status: IntentStatus.FAILED,
          error: 'Transaction reverted on-chain',
        },
      });
    });

    it("skips the whole run when the villain's own Agent row isn't found yet", async () => {
      const prisma = makePrisma();
      prisma.agent.findUnique.mockResolvedValueOnce(null);
      const service = makeService(prisma);

      await service.run();

      expect(prisma.policy.findMany).not.toHaveBeenCalled();
    });
  });

  describe('tick', () => {
    it('skips a tick that overlaps one still in flight, so a slow run cannot double-submit', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      let resolveFirstRun!: () => void;
      const firstRun = new Promise<void>((resolve) => {
        resolveFirstRun = resolve;
      });
      const runSpy = vi
        .spyOn(service, 'run')
        .mockReturnValueOnce(firstRun)
        .mockResolvedValueOnce(undefined);

      const firstTick = service.tick();
      const secondTick = service.tick(); // fires while the first is still in flight

      expect(runSpy).toHaveBeenCalledTimes(1);
      resolveFirstRun();
      await Promise.all([firstTick, secondTick]);

      // The overlapping call was skipped entirely — run() still only called once.
      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('allows the next tick to run once the previous one has finished', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      const runSpy = vi.spyOn(service, 'run').mockResolvedValue(undefined);

      await service.tick();
      await service.tick();

      expect(runSpy).toHaveBeenCalledTimes(2);
    });
  });
});
