import { describe, expect, it, vi } from 'vitest';
import { TrustService } from './trust.service.js';

const TRUST_READER = '0x1111111111111111111111111111111111111a';
const IDENTITY_REGISTRY = '0x2222222222222222222222222222222222222b';
const REPUTATION_REGISTRY = '0x3333333333333333333333333333333333333c';

type RegistryHandlers = {
  getAgentWallet?: (agentId: bigint) => string;
  readAllFeedback?: (
    agentId: bigint,
  ) => readonly [string[], bigint[], bigint[], number[], string[], string[], boolean[]];
};

function makeService(registry: RegistryHandlers = {}, prisma: unknown = {}) {
  const readContract = vi.fn(
    async ({
      address,
      functionName,
      args,
    }: {
      address: string;
      functionName: string;
      args?: readonly unknown[];
    }) => {
      if (functionName === 'trustReader') return TRUST_READER;
      if (address === TRUST_READER) {
        switch (functionName) {
          case 'identityRegistry':
            return IDENTITY_REGISTRY;
          case 'reputationRegistry':
            return REPUTATION_REGISTRY;
          case 'VERIFIED_MIN_SCORE_WAD':
            return 80n * 10n ** 18n;
          case 'VERIFIED_MIN_FEEDBACK_COUNT':
            return 3n;
        }
      }
      if (address === IDENTITY_REGISTRY && functionName === 'getAgentWallet') {
        if (!registry.getAgentWallet) throw new Error('unexpected getAgentWallet call');
        return registry.getAgentWallet((args as [bigint])[0]);
      }
      if (address === REPUTATION_REGISTRY && functionName === 'readAllFeedback') {
        if (!registry.readAllFeedback) throw new Error('unexpected readAllFeedback call');
        return registry.readAllFeedback((args as [bigint])[0]);
      }
      throw new Error(`unexpected call ${functionName} @ ${address}`);
    },
  );

  const chain = {
    handlerWalletAddress: '0x9999999999999999999999999999999999999d',
    publicClient: { readContract },
  };

  const service = new TrustService(chain as never, prisma as never);
  return { service, readContract };
}

describe('TrustService.getTrustConfig', () => {
  it('resolves the trust config via HandlerWallet.trustReader() -> TrustReader getters', async () => {
    const { service } = makeService();

    const config = await service.getTrustConfig();

    expect(config).toEqual({
      trustReaderAddress: TRUST_READER,
      identityRegistryAddress: IDENTITY_REGISTRY,
      reputationRegistryAddress: REPUTATION_REGISTRY,
      verifiedMinScoreWad: 80n * 10n ** 18n,
      verifiedMinFeedbackCount: 3n,
    });
  });

  it('caches the resolved config: a second call does not re-read the chain', async () => {
    const { service, readContract } = makeService();

    await service.getTrustConfig();
    const callsAfterFirst = readContract.mock.calls.length;
    await service.getTrustConfig();

    expect(readContract.mock.calls.length).toBe(callsAfterFirst);
  });

  it('does not cache a failed resolution, so the next call retries', async () => {
    const chain = {
      handlerWalletAddress: '0x9999999999999999999999999999999999999d',
      publicClient: {
        readContract: vi
          .fn()
          .mockRejectedValueOnce(new Error('rpc down'))
          .mockResolvedValueOnce(TRUST_READER)
          .mockResolvedValueOnce(IDENTITY_REGISTRY)
          .mockResolvedValueOnce(REPUTATION_REGISTRY)
          .mockResolvedValueOnce(80n * 10n ** 18n)
          .mockResolvedValueOnce(3n),
      },
    };
    const service = new TrustService(chain as never, {} as never);

    await expect(service.getTrustConfig()).rejects.toThrow('rpc down');
    const config = await service.getTrustConfig();

    expect(config.trustReaderAddress).toBe(TRUST_READER);
  });
});

const AGENT_ADDRESS = '0x4444444444444444444444444444444444444d';
const AGENT_ID = 7n;

describe('TrustService.refreshTier', () => {
  it('flags an agent with no erc8004AgentId (never registered)', async () => {
    const { service } = makeService();

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: null,
    });

    expect(result).toMatchObject({ ok: true, trustTier: 'FLAGGED' });
  });

  it('flags an agent whose agentId now resolves to a different registry wallet', async () => {
    const { service } = makeService({
      getAgentWallet: () => '0x5555555555555555555555555555555555555e',
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toMatchObject({ ok: true, trustTier: 'FLAGGED' });
  });

  it('resolves VERIFIED when feedback count and average clear both thresholds', async () => {
    const { service } = makeService({
      getAgentWallet: () => AGENT_ADDRESS,
      readAllFeedback: () => [
        [],
        [],
        [90n, 85n, 95n],
        [0, 0, 0],
        [],
        [],
        [],
      ],
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      trustTier: 'VERIFIED',
      attestationCount: 3,
    });
  });

  it('resolves NEW when synced but under the feedback threshold', async () => {
    const { service } = makeService({
      getAgentWallet: () => AGENT_ADDRESS,
      readAllFeedback: () => [[], [], [90n], [0], [], [], []],
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      trustTier: 'NEW',
      attestationCount: 1,
    });
  });

  it('resolves NEW with zero feedback (synced, no ratings)', async () => {
    const { service } = makeService({
      getAgentWallet: () => AGENT_ADDRESS,
      readAllFeedback: () => [[], [], [], [], [], [], []],
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      trustTier: 'NEW',
      attestationCount: 0,
    });
  });

  it('keeps the existing tier when the reputation registry is unreachable', async () => {
    const { service } = makeService({
      getAgentWallet: () => AGENT_ADDRESS,
      readAllFeedback: () => {
        throw new Error('rpc timeout');
      },
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toEqual({
      ok: false,
      trustSummary: "Couldn't refresh trust",
    });
  });

  it('excludes a malformed feedback entry (decimals > 18) instead of freezing on it', async () => {
    const { service } = makeService({
      getAgentWallet: () => AGENT_ADDRESS,
      // A hostile/malformed entry (decimals 19, unnormalizable to WAD) mixed in with
      // three legitimate ones — the malformed entry must not crash or poison the average.
      readAllFeedback: () => [
        [],
        [],
        [90n, 85n, 95n, 1n],
        [0, 0, 0, 19],
        [],
        [],
        [],
      ],
    });

    const result = await service.refreshTier({
      address: AGENT_ADDRESS,
      erc8004AgentId: AGENT_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      trustTier: 'VERIFIED',
      attestationCount: 3,
    });
  });
});

describe('TrustService.tick', () => {
  it('writes all six trust fields for a successfully refreshed agent', async () => {
    const update = vi.fn(async (_args: unknown) => ({}));
    const prisma = {
      agent: {
        findMany: vi.fn(async () => [
          { id: 'a1', address: AGENT_ADDRESS, erc8004AgentId: AGENT_ID },
        ]),
        update,
      },
    };
    const { service } = makeService(
      {
        getAgentWallet: () => AGENT_ADDRESS,
        readAllFeedback: () => [[], [], [90n, 85n, 95n], [0, 0, 0], [], [], []],
      },
      prisma,
    );

    await service.tick();

    expect(update).toHaveBeenCalledTimes(1);
    const call = update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 'a1' });
    expect(call.data).toMatchObject({
      trustTier: 'VERIFIED',
      trustSource: 'CHAIN',
      attestationCount: 3,
    });
  });

  it('only updates trustSummary for an agent whose registry read failed', async () => {
    const update = vi.fn(async (_args: unknown) => ({}));
    const prisma = {
      agent: {
        findMany: vi.fn(async () => [
          { id: 'a1', address: AGENT_ADDRESS, erc8004AgentId: AGENT_ID },
        ]),
        update,
      },
    };
    const { service } = makeService(
      {
        getAgentWallet: () => AGENT_ADDRESS,
        readAllFeedback: () => {
          throw new Error('rpc timeout');
        },
      },
      prisma,
    );

    await service.tick();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { trustSummary: "Couldn't refresh trust" },
    });
  });

  it("doesn't let one agent's failure stop the rest from refreshing", async () => {
    const update = vi.fn(async (_args: unknown) => ({}));
    const ok = '0x6666666666666666666666666666666666666f';
    const prisma = {
      agent: {
        findMany: vi.fn(async () => [
          { id: 'bad', address: AGENT_ADDRESS, erc8004AgentId: AGENT_ID },
          { id: 'good', address: ok, erc8004AgentId: null },
        ]),
        update: vi.fn(async (args: { where: { id: string } }) => {
          if (args.where.id === 'bad') throw new Error('db write failed');
          return update(args);
        }),
      },
    };
    const { service } = makeService({}, prisma);

    await service.tick();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'good' } }),
    );
  });
});
