import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  NotFoundException,
} from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChainService } from '../chain/chain.service.js';
import { AgentKind, IntentStatus } from '../generated/prisma/enums.js';
import { AgentsService } from './agents.service.js';
import type { OneInchSwapQuote, OneInchService } from './oneinch.service.js';

const STUB_QUOTE: OneInchSwapQuote = {
  to: '0x111111125421cA6dc452d289314280a0f8842A65',
  data: '0xdead',
  value: 0n,
  raw: {},
};

// Stubs viem's log decoder so tests can drive CONFIRMED vs BLOCKED by passing
// already-"decoded" log stand-ins as `receipt.logs`, without needing real
// ABI-encoded event data.
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    parseEventLogs: vi.fn(({ logs }: { logs: unknown[] }) => logs),
  };
});

/** Structural shape of the PrismaService test double — just what AgentsService calls. */
type MockPrisma = {
  agent: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  wallet: { findFirst: ReturnType<typeof vi.fn> };
  policy: { findUnique: ReturnType<typeof vi.fn> };
  intent: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function makePrisma(): MockPrisma {
  return {
    agent: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(),
    },
    wallet: { findFirst: vi.fn() },
    policy: { findUnique: vi.fn() },
    intent: {
      create: vi.fn(async (args) => ({ id: 'intent-1', ...args.data })),
      update: vi.fn(async (args) => ({ id: 'intent-1', ...args.data })),
    },
  };
}

function makeChain(
  waitForTransactionReceipt: ReturnType<typeof vi.fn> = vi.fn(),
): Pick<ChainService, 'handlerWalletAddress' | 'handlerWalletAbi' | 'publicClient'> {
  return {
    handlerWalletAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    handlerWalletAbi: [] as unknown as ChainService['handlerWalletAbi'],
    publicClient: {
      waitForTransactionReceipt,
    } as unknown as ChainService['publicClient'],
  };
}

/** Replaces the service's internal wallet client with a stub `writeContract`,
 * bypassing the real signer viem builds in the constructor. */
function stubWriteContract(
  service: AgentsService,
  writeContract: ReturnType<typeof vi.fn>,
) {
  (service as unknown as { rileyWalletClient: { writeContract: unknown } }).rileyWalletClient =
    { writeContract };
}

function makeOneInch(
  impl: OneInchService['getSwapQuote'] = vi.fn(),
): Pick<OneInchService, 'getSwapQuote'> {
  return { getSwapQuote: impl };
}

const RILEY_SESSION_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

beforeEach(() => {
  process.env.RILEY_SESSION_KEY = RILEY_SESSION_KEY;
  process.env.ONEINCH_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.RILEY_SESSION_KEY;
  delete process.env.ONEINCH_API_KEY;
});

function makeService(
  prisma: MockPrisma,
  oneInch = makeOneInch(),
  chain = makeChain(),
) {
  return new AgentsService(
    prisma as unknown as PrismaService,
    chain as unknown as ChainService,
    oneInch as unknown as OneInchService,
  );
}

describe('AgentsService', () => {
  it("derives Riley's address from the session key, never storing the key itself", () => {
    const service = makeService(makePrisma());
    const expected = privateKeyToAccount(RILEY_SESSION_KEY).address;
    expect(service.rileyAddress).toBe(expected);
  });

  it('self-registers Riley as a lowercase-addressed HIRED catalog agent on boot', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await service.onModuleInit();

    expect(prisma.agent.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.agent.upsert.mock.calls[0][0];
    expect(call.where.address).toBe(service.rileyAddress.toLowerCase());
    expect(call.create.kind).toBe(AgentKind.HIRED);
    expect(call.create.keyEnvVar).toBe('RILEY_SESSION_KEY');
    expect(call.update.kind).toBe(AgentKind.HIRED);
  });

  it('throws a clear error when RILEY_SESSION_KEY is unset', () => {
    delete process.env.RILEY_SESSION_KEY;
    expect(() => makeService(makePrisma())).toThrow(/Invalid agents environment/);
  });

  describe('run', () => {
    it('404s when the agent id does not resolve to Riley', async () => {
      const prisma = makePrisma();
      prisma.agent.findUnique.mockResolvedValue({
        id: 'other-agent',
        address: '0x000000000000000000000000000000000000ab',
      });
      const service = makeService(prisma);

      await expect(service.run('0xowner', 'other-agent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("404s when the session's wallet doesn't exist", async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      prisma.agent.findUnique.mockResolvedValue({
        id: 'riley-id',
        address: service.rileyAddress.toLowerCase(),
      });
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("404s when Riley isn't hired for this wallet (wallet-scoping)", async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      prisma.agent.findUnique.mockResolvedValue({
        id: 'riley-id',
        address: service.rileyAddress.toLowerCase(),
      });
      prisma.wallet.findFirst.mockResolvedValue({ address: '0xwallet' });
      prisma.policy.findUnique.mockResolvedValue(null);

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a failed 1inch quote to a 502, with no Intent row created', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(vi.fn(async () => {
        throw new Error('1inch down');
      }));
      const service = makeService(prisma, oneInch);
      prisma.agent.findUnique.mockResolvedValue({
        id: 'riley-id',
        address: service.rileyAddress.toLowerCase(),
      });
      prisma.wallet.findFirst.mockResolvedValue({ address: '0xwallet' });
      prisma.policy.findUnique.mockResolvedValue({ id: 'policy-1' });

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(prisma.intent.create).not.toHaveBeenCalled();
    });

    function setupHiredRiley(prisma: MockPrisma, service: AgentsService) {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'riley-id',
        address: service.rileyAddress.toLowerCase(),
      });
      prisma.wallet.findFirst.mockResolvedValue({ address: '0xwallet' });
      prisma.policy.findUnique.mockResolvedValue({
        id: 'policy-1',
        frozen: false,
      });
    }

    it('409s without calling 1inch when the policy mirror already shows frozen', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(vi.fn());
      const service = makeService(prisma, oneInch);
      prisma.agent.findUnique.mockResolvedValue({
        id: 'riley-id',
        address: service.rileyAddress.toLowerCase(),
      });
      prisma.wallet.findFirst.mockResolvedValue({ address: '0xwallet' });
      prisma.policy.findUnique.mockResolvedValue({ id: 'policy-1', frozen: true });

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(oneInch.getSwapQuote).not.toHaveBeenCalled();
    });

    it('409s a second concurrent run for the same wallet/agent instead of double-submitting', async () => {
      const prisma = makePrisma();
      let resolveQuote!: (v: OneInchSwapQuote) => void;
      const oneInch = makeOneInch(
        vi.fn(() => new Promise<OneInchSwapQuote>((resolve) => (resolveQuote = resolve))),
      );
      const service = makeService(prisma, oneInch);
      setupHiredRiley(prisma, service);
      stubWriteContract(
        service,
        vi.fn(async () => {
          throw new Error('should not be reached by the rejected second call');
        }),
      );

      const first = service.run('0xowner', 'riley-id');
      const second = service.run('0xowner', 'riley-id');

      await expect(second).rejects.toBeInstanceOf(ConflictException);
      resolveQuote(STUB_QUOTE);
      // The first call proceeds and hits the stubbed writeContract failure above —
      // the point of this test is that the second call never got that far at all.
      await expect(first).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('submits, confirms, and settles the Intent as CONFIRMED on a clean Executed receipt', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(
        vi.fn(async () => (STUB_QUOTE)),
      );
      const waitForTransactionReceipt = vi.fn(async () => ({
        status: 'success',
        logs: [{ eventName: 'Executed' }],
      }));
      const service = makeService(prisma, oneInch, makeChain(waitForTransactionReceipt));
      setupHiredRiley(prisma, service);
      stubWriteContract(service, vi.fn(async () => '0xtxhash'));

      const result = (await service.run('0xowner', 'riley-id')) as { status: string };
      expect(result.status).toBe(IntentStatus.CONFIRMED);
    });

    it('settles the Intent as BLOCKED when the receipt carries an ExecutionBlocked log', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(
        vi.fn(async () => (STUB_QUOTE)),
      );
      const waitForTransactionReceipt = vi.fn(async () => ({
        status: 'success',
        logs: [{ eventName: 'ExecutionBlocked' }],
      }));
      const service = makeService(prisma, oneInch, makeChain(waitForTransactionReceipt));
      setupHiredRiley(prisma, service);
      stubWriteContract(service, vi.fn(async () => '0xtxhash'));

      const result = (await service.run('0xowner', 'riley-id')) as { status: string };
      expect(result.status).toBe(IntentStatus.BLOCKED);
    });

    it('settles the Intent as FAILED when the receipt itself reverted', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(
        vi.fn(async () => (STUB_QUOTE)),
      );
      const waitForTransactionReceipt = vi.fn(async () => ({
        status: 'reverted',
        logs: [],
      }));
      const service = makeService(prisma, oneInch, makeChain(waitForTransactionReceipt));
      setupHiredRiley(prisma, service);
      stubWriteContract(service, vi.fn(async () => '0xtxhash'));

      const result = (await service.run('0xowner', 'riley-id')) as { status: string };
      expect(result.status).toBe(IntentStatus.FAILED);
    });

    it('marks the Intent FAILED and maps to a 502 when submitting the tx throws', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(
        vi.fn(async () => (STUB_QUOTE)),
      );
      const service = makeService(prisma, oneInch);
      setupHiredRiley(prisma, service);
      stubWriteContract(
        service,
        vi.fn(async () => {
          throw new Error('nonce too low');
        }),
      );

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      const updateCall = prisma.intent.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(IntentStatus.FAILED);
      expect(updateCall.data.error).toMatch(/nonce too low/);
    });

    it('maps a receipt-wait timeout to a 504, leaving the Intent at SUBMITTED (not guessed FAILED)', async () => {
      const prisma = makePrisma();
      const oneInch = makeOneInch(
        vi.fn(async () => (STUB_QUOTE)),
      );
      const waitForTransactionReceipt = vi.fn(async () => {
        throw new Error('timed out');
      });
      const service = makeService(prisma, oneInch, makeChain(waitForTransactionReceipt));
      setupHiredRiley(prisma, service);
      stubWriteContract(service, vi.fn(async () => '0xtxhash'));

      await expect(service.run('0xowner', 'riley-id')).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
      const lastUpdate =
        prisma.intent.update.mock.calls[prisma.intent.update.mock.calls.length - 1][0];
      expect(lastUpdate.data.status).toBe(IntentStatus.SUBMITTED);
    });
  });
});
