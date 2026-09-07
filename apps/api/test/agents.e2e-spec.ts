import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { AgentsModule } from '../src/agents/agents.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TrustTier } from '../src/generated/prisma/enums.js';

const RILEY_TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/**
 * Exercises the real POST /agents/:id/run route end to end against the local
 * Postgres instance: the 401-without-session path, and the wallet-scoping check
 * (a session for wallet A must not be able to run Riley for wallet B's hire), per
 * context/coding-standards.md's e2e requirement. Stops short of a real 1inch/chain
 * call (that boundary is exercised manually — see current-feature.md step 4/6
 * notes) so this spec stays deterministic and network-free.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Agents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const DOMAIN = 'localhost';
  const URI = 'http://localhost';
  const CHAIN_ID = 31337;

  const createdWalletAddresses: string[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'e'.repeat(32);
    process.env.SIWE_DOMAIN ??= DOMAIN;
    process.env.SIWE_CHAIN_ID ??= String(CHAIN_ID);
    process.env.RILEY_SESSION_KEY ??= RILEY_TEST_KEY;
    process.env.ONEINCH_API_KEY ??= 'test-key';

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, AgentsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.SESSION_SECRET));
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.policy.deleteMany({
      where: { walletAddress: { in: createdWalletAddresses } },
    });
    await prisma.wallet.deleteMany({
      where: { address: { in: createdWalletAddresses } },
    });
    await prisma.session.deleteMany({ where: { address: { contains: '0x' } } });
    await prisma.siweNonce.deleteMany({ where: { address: { contains: '0x' } } });
    await app.close();
  });

  async function signIn() {
    const account = privateKeyToAccount(generatePrivateKey());
    const { body: nonceBody } = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address: account.address })
      .expect(201);

    const siwe = new SiweMessage({
      domain: DOMAIN,
      address: account.address,
      statement: 'Sign in to Handler.',
      uri: URI,
      version: '1',
      chainId: CHAIN_ID,
      nonce: nonceBody.nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ message, signature })
      .expect(201);

    const cookie = verifyRes.headers['set-cookie'];
    return { address: account.address.toLowerCase(), cookie };
  }

  async function createWallet(owner: string) {
    const address = `0x${owner.slice(2, 10)}${'0'.repeat(32)}`;
    createdWalletAddresses.push(address);
    return prisma.wallet.create({
      data: { address, chainId: CHAIN_ID, owner },
    });
  }

  it('POST /agents/:id/run returns 401 with no session cookie', async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });
    await request(app.getHttpServer())
      .post(`/agents/${riley.id}/run`)
      .expect(401);
  });

  it("does not let wallet A's session run Riley through wallet B's hire", async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });

    const ownerB = await signIn();
    const walletB = await createWallet(ownerB.address);
    await prisma.policy.create({
      data: {
        walletAddress: walletB.address,
        agentId: riley.id,
        sessionKey: riley.address,
        dailyCapUsd: 500_00000000n,
        perTxCapUsd: 500_00000000n,
        cosignAboveUsd: 500_00000000n,
        minCounterpartyTier: TrustTier.FLAGGED,
        allowSwaps: true,
        allowUnknownContracts: false,
      },
    });

    // Wallet A has no wallet/policy of its own — it must not reach wallet B's.
    const ownerA = await signIn();
    const res = await request(app.getHttpServer())
      .post(`/agents/${riley.id}/run`)
      .set('Cookie', ownerA.cookie)
      .expect(404);
    expect(res.body.message).toMatch(/no wallet/i);

    // Sanity check: the run route does resolve wallet B's own policy correctly —
    // it only fails past this point at the real 1inch network call, which this
    // spec doesn't exercise (see the file header).
    const resB = await request(app.getHttpServer())
      .post(`/agents/${riley.id}/run`)
      .set('Cookie', ownerB.cookie);
    expect(resB.status).not.toBe(404);
  });
});
