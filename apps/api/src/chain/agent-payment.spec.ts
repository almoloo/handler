import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChainService } from './chain.service.js';
import { IntentStatus } from '../generated/prisma/enums.js';
import { submitAgentPayment } from './agent-payment.js';

const ACCOUNT = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff81',
);
const WALLET_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const TARGET = '0xdddddddddddddddddddddddddddddddddddddddd' as Address;
const TX_HASH = `0x${'1'.repeat(64)}` as const;

function makePrisma() {
  return {
    intent: {
      create: vi.fn(async () => ({ id: 'intent-1' })),
      update: vi.fn(async () => ({})),
    },
  };
}

function makeChain(status: 'success' | 'reverted' = 'success') {
  return {
    publicClient: {
      waitForTransactionReceipt: vi.fn(async () => ({ status })),
    },
    handlerWalletAbi: [],
  };
}

function makeWalletClient() {
  return { writeContract: vi.fn(async () => TX_HASH) };
}

function callWith(
  overrides: Partial<Parameters<typeof submitAgentPayment>[0]> = {},
  prisma = makePrisma(),
  chain = makeChain(),
  walletClient = makeWalletClient(),
) {
  const promise = submitAgentPayment({
    prisma: prisma as unknown as PrismaService,
    chain: chain as unknown as ChainService,
    account: ACCOUNT,
    walletClient: walletClient as never,
    walletAddress: WALLET_ADDRESS,
    policyId: 'policy-1',
    agentId: 'agent-1',
    target: TARGET,
    valueWei: 1000n,
    ...overrides,
  });
  return { promise, prisma, chain, walletClient };
}

describe('submitAgentPayment', () => {
  it('links the Intent row to a DemoRun when one triggered the payment', async () => {
    const { promise, prisma } = callWith({ demoRunId: 'demo-run-1' });
    await promise;

    expect(prisma.intent.create).toHaveBeenCalledOnce();
    const created = prisma.intent.create.mock.calls[0][0] as {
      data: { demoRunId: string | null; status: string };
    };
    expect(created.data.demoRunId).toBe('demo-run-1');
    expect(created.data.status).toBe(IntentStatus.PLANNED);
  });

  it('leaves demoRunId null for an ordinary cron-driven payment', async () => {
    const { promise, prisma } = callWith();
    await promise;

    const created = prisma.intent.create.mock.calls[0][0] as {
      data: { demoRunId: string | null };
    };
    expect(created.data.demoRunId).toBeNull();
  });

  it('submits the same tryExecute call either way', async () => {
    const { promise, walletClient } = callWith({ demoRunId: 'demo-run-1' });
    await promise;

    const call = walletClient.writeContract.mock.calls[0][0] as {
      address: Address;
      functionName: string;
      args: [{ target: Address; data: string; value: bigint }];
    };
    expect(call.address).toBe(WALLET_ADDRESS);
    expect(call.functionName).toBe('tryExecute');
    expect(call.args[0]).toEqual({ target: TARGET, data: '0x', value: 1000n });
  });

  it('marks the Intent SUBMITTED once the tx is broadcast', async () => {
    const { promise, prisma } = callWith();
    await promise;

    const update = prisma.intent.update.mock.calls[0][0] as {
      data: { status: string; txHash: string };
    };
    expect(update.data.status).toBe(IntentStatus.SUBMITTED);
    expect(update.data.txHash).toBe(TX_HASH);
  });

  it('marks the Intent FAILED when the tx reverts on-chain', async () => {
    const prisma = makePrisma();
    const { promise } = callWith({}, prisma, makeChain('reverted'));
    await promise;

    const last = prisma.intent.update.mock.calls.at(-1)?.[0] as {
      data: { status: string; error: string };
    };
    expect(last.data.status).toBe(IntentStatus.FAILED);
    expect(last.data.error).toMatch(/reverted/i);
  });

  it('marks the Intent FAILED when the submit itself throws', async () => {
    const prisma = makePrisma();
    const walletClient = {
      writeContract: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    };
    const { promise } = callWith({}, prisma, makeChain(), walletClient);
    await promise;

    const last = prisma.intent.update.mock.calls.at(-1)?.[0] as {
      data: { status: string; error: string };
    };
    expect(last.data.status).toBe(IntentStatus.FAILED);
    expect(last.data.error).toMatch(/rpc down/);
  });
});
