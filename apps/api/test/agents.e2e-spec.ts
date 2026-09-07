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
 * Exercises the real /agents routes end to end against the local Postgres
 * instance: POST /agents/:id/run's 401-without-session path and wallet-scoping
 * check (a session for wallet A must not be able to run Riley for wallet B's
 * hire); and GET /agents, /agents/catalog, /agents/:id's 401 path, empty vs.
 * real payroll rows, the two-wallet non-leak case, and the agent-file's
 * policy: null vs. hired shape, per context/coding-standards.md's e2e
 * requirement and current-feature.md's 5a spec. Stops short of a real
 * 1inch/chain call for /run (that boundary is exercised manually — see
 * current-feature.md step 4/6 notes) so this spec stays deterministic and
 * network-free.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Agents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const DOMAIN = 'localhost';
  const URI = 'http://localhost';
  const CHAIN_ID = 31337;

  const createdWalletAddresses: string[] = [];
  // Scopes Session/SiweNonce cleanup to addresses *this file* created — a
  // blanket `contains: '0x'` delete would race with other e2e spec files
  // running concurrently against the same Postgres instance and could wipe
  // out a session another file's test is still using mid-run.
  const createdOwnerAddresses: string[] = [];

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
    await prisma.session.deleteMany({
      where: { address: { in: createdOwnerAddresses } },
    });
    await prisma.siweNonce.deleteMany({
      where: { address: { in: createdOwnerAddresses } },
    });
    await app.close();
  });

  async function signIn() {
    const account = privateKeyToAccount(generatePrivateKey());
    createdOwnerAddresses.push(account.address.toLowerCase());
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

  it('GET /agents, /agents/catalog, and /agents/:id return 401 with no session cookie', async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });
    await request(app.getHttpServer()).get('/agents').expect(401);
    await request(app.getHttpServer()).get('/agents/catalog').expect(401);
    await request(app.getHttpServer()).get(`/agents/${riley.id}`).expect(401);
  });

  it('GET /agents returns [] for a signed-in wallet with no Wallet row yet', async () => {
    const owner = await signIn();
    const res = await request(app.getHttpServer())
      .get('/agents')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /agents returns real rows once a Wallet + Policy exist, and never leaks another wallet\'s row', async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });

    const ownerWithPolicy = await signIn();
    const walletWithPolicy = await createWallet(ownerWithPolicy.address);
    await prisma.policy.create({
      data: {
        walletAddress: walletWithPolicy.address,
        agentId: riley.id,
        sessionKey: riley.address,
        dailyCapUsd: 500_00000000n,
        perTxCapUsd: 150_00000000n,
        cosignAboveUsd: 300_00000000n,
        minCounterpartyTier: TrustTier.NEW,
        allowSwaps: true,
        allowUnknownContracts: false,
      },
    });

    const ownerWithoutPolicy = await signIn();
    await createWallet(ownerWithoutPolicy.address);

    const resWithPolicy = await request(app.getHttpServer())
      .get('/agents')
      .set('Cookie', ownerWithPolicy.cookie)
      .expect(200);
    expect(resWithPolicy.body).toHaveLength(1);
    expect(resWithPolicy.body[0]).toMatchObject({
      agentId: riley.id,
      name: riley.name,
      dailyCapUsd: '50000000000',
      perTxCapUsd: '15000000000',
      spentTodayUsd: '0',
      frozen: false,
    });
    expect(resWithPolicy.body[0].policySentences).toContain(
      'Only pays agents rated New or higher.',
    );

    const resWithoutPolicy = await request(app.getHttpServer())
      .get('/agents')
      .set('Cookie', ownerWithoutPolicy.cookie)
      .expect(200);
    expect(resWithoutPolicy.body).toEqual([]);
  });

  it('GET /agents/catalog lists Riley with a trust tier', async () => {
    const owner = await signIn();
    const res = await request(app.getHttpServer())
      .get('/agents/catalog')
      .set('Cookie', owner.cookie)
      .expect(200);
    const riley = res.body.find((a: { name: string }) => a.name === 'Riley');
    expect(riley).toBeDefined();
    expect(riley.trustTier).toBeDefined();
  });

  it('GET /agents/:id returns policy: null for a wallet that has not hired the agent', async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });
    const owner = await signIn();
    const res = await request(app.getHttpServer())
      .get(`/agents/${riley.id}`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body.agentId).toBe(riley.id);
    expect(res.body.policy).toBeNull();
    expect(res.body.recentActivity).toEqual([]);
  });

  it('GET /agents/:id returns the policy + sentences for a wallet that hired the agent', async () => {
    const riley = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(RILEY_TEST_KEY).address.toLowerCase() },
    });
    const owner = await signIn();
    const wallet = await createWallet(owner.address);
    await prisma.policy.create({
      data: {
        walletAddress: wallet.address,
        agentId: riley.id,
        sessionKey: riley.address,
        dailyCapUsd: 500_00000000n,
        perTxCapUsd: 150_00000000n,
        cosignAboveUsd: 300_00000000n,
        minCounterpartyTier: TrustTier.FLAGGED,
        allowSwaps: false,
        allowUnknownContracts: false,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/agents/${riley.id}`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body.policy).toMatchObject({
      dailyCapUsd: '50000000000',
      allowSwaps: false,
    });
    expect(res.body.policy.policySentences).toContain('Swaps: not allowed.');
  });

  it('GET /agents/:id returns 404 for an agent that does not exist', async () => {
    const owner = await signIn();
    await request(app.getHttpServer())
      .get('/agents/does-not-exist')
      .set('Cookie', owner.cookie)
      .expect(404);
  });
});
