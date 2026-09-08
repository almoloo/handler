import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AgentKind } from '../generated/prisma/enums.js';
import { AgentsService } from './agents.service.js';

/** Structural shape of the PrismaService test double — just what AgentsService calls. */
type MockPrisma = {
  agent: { upsert: ReturnType<typeof vi.fn> };
  wallet: { findFirst: ReturnType<typeof vi.fn> };
};

function makePrisma(): MockPrisma {
  return {
    agent: { upsert: vi.fn(async () => ({})) },
    wallet: { findFirst: vi.fn() },
  };
}

const RILEY_SESSION_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

beforeEach(() => {
  process.env.RILEY_SESSION_KEY = RILEY_SESSION_KEY;
});

afterEach(() => {
  delete process.env.RILEY_SESSION_KEY;
});

function makeService(prisma: MockPrisma) {
  return new AgentsService(prisma as unknown as PrismaService);
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
});
