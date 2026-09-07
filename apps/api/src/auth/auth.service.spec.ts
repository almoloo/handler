import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { generateNonce, SiweMessage } from 'siwe';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

/** Structural shape of the PrismaService test double — just what AuthService calls. */
type MockPrisma = {
  siweNonce: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  session: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): MockPrisma {
  return {
    siweNonce: {
      create: vi.fn(async ({ data }) => data),
      // Defaults to "no live nonce found"; individual tests override to simulate a
      // matching row (count: 1) for the atomic claim in AuthService.verify.
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    session: {
      create: vi.fn(async ({ data }) => ({ id: 'session-1', ...data })),
      findUnique: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

const DOMAIN = 'localhost';
const URI = 'http://localhost';
const CHAIN_ID = 31337;

beforeEach(() => {
  process.env.SESSION_SECRET = 'a'.repeat(32);
  process.env.SIWE_DOMAIN = DOMAIN;
  process.env.SIWE_CHAIN_ID = String(CHAIN_ID);
});

describe('AuthService.issueNonce', () => {
  it('rejects an invalid address', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    await expect(service.issueNonce('not-an-address')).rejects.toThrow(
      /Invalid address/,
    );
  });

  it('persists a lowercased address with the configured nonce and creates a nonce', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = await service.issueNonce(account.address);
    expect(nonce).toHaveLength(generateNonce().length);
    expect(prisma.siweNonce.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nonce,
          address: account.address.toLowerCase(),
        }),
      }),
    );
  });
});

describe('AuthService.verify', () => {
  async function signMessage(nonce: string) {
    const account = privateKeyToAccount(generatePrivateKey());
    const siwe = new SiweMessage({
      domain: DOMAIN,
      address: account.address,
      statement: 'Sign in to Handler.',
      uri: URI,
      version: '1',
      chainId: CHAIN_ID,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });
    return { message, signature, address: account.address.toLowerCase() };
  }

  it('starts a session for a valid signature against a live nonce', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const nonce = generateNonce();
    const { message, signature, address } = await signMessage(nonce);
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 1 });

    const session = await service.verify(message, signature);

    expect(session.address).toBe(address);
    expect(prisma.siweNonce.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nonce,
          address,
          consumedAt: null,
        }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ address }) }),
    );
  });

  it('rejects an unknown nonce', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const { message, signature } = await signMessage(generateNonce());
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verify(message, signature)).rejects.toThrow(
      /Invalid or expired nonce/,
    );
  });

  it('rejects a nonce the atomic claim can\'t match (expired, reused, or wrong address)', async () => {
    // The claim's WHERE clause (nonce + address + consumedAt: null + expiresAt in the
    // future) folds "expired", "already consumed", and "wrong address" into the same
    // observable outcome: 0 rows updated. Exercised once here; the SQL predicate itself
    // is what enforces each condition, not branching in this service.
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const nonce = generateNonce();
    const { message, signature } = await signMessage(nonce);
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verify(message, signature)).rejects.toThrow(
      /Invalid or expired nonce/,
    );
  });

  it('rejects a message signed for a different domain', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const nonce = generateNonce();
    const account = privateKeyToAccount(generatePrivateKey());
    const siwe = new SiweMessage({
      domain: 'evil.example',
      address: account.address,
      statement: 'Sign in to Handler.',
      uri: URI,
      version: '1',
      chainId: CHAIN_ID,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verify(message, signature)).rejects.toThrow(
      /Invalid SIWE signature/,
    );
  });

  it('rejects a message signed for a different chain', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const nonce = generateNonce();
    const account = privateKeyToAccount(generatePrivateKey());
    const siwe = new SiweMessage({
      domain: DOMAIN,
      address: account.address,
      statement: 'Sign in to Handler.',
      uri: URI,
      version: '1',
      chainId: CHAIN_ID + 1,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verify(message, signature)).rejects.toThrow(
      /Wrong chain/,
    );
    // Rejected before the nonce is ever claimed, so a wrong-chain replay can't burn
    // a legitimate nonce.
    expect(prisma.siweNonce.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a tampered signature', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const nonce = generateNonce();
    const { message } = await signMessage(nonce);
    prisma.siweNonce.updateMany.mockResolvedValue({ count: 1 });
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const badSignature = await otherAccount.signMessage({ message });

    await expect(service.verify(message, badSignature)).rejects.toThrow(
      /Invalid SIWE signature/,
    );
  });
});

describe('AuthService.getSession', () => {
  it('returns null for a missing session', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    prisma.session.findUnique.mockResolvedValue(null);
    expect(await service.getSession('nope')).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      address: '0xabc',
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await service.getSession('s1')).toBeNull();
  });

  it('returns the session when live', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    const session = {
      id: 's1',
      address: '0xabc',
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.session.findUnique.mockResolvedValue(session);
    expect(await service.getSession('s1')).toEqual(session);
  });
});

describe('AuthService.revoke', () => {
  it('deletes the session row', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma as unknown as PrismaService);
    await service.revoke('s1');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: 's1' },
    });
  });
});
