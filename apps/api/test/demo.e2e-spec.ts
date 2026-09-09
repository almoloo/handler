import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { DemoModule } from '../src/demo/demo.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AgentKind } from '../src/generated/prisma/enums.js';
import { DEMO_TOKEN_HEADER } from '../src/demo/demo.guard.js';

const VILLAIN_TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff81';
const RILEY_TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEMO_TOKEN = 'an-e2e-demo-token-value';
const DOMAIN = 'localhost';
const URI = 'http://localhost';
const CHAIN_ID = 31337;

/** Everything the DemoModule's dependency tree needs to construct. */
function primeBaseEnv() {
  process.env.SESSION_SECRET ??= 'e'.repeat(32);
  process.env.SIWE_DOMAIN ??= DOMAIN;
  process.env.SIWE_CHAIN_ID ??= String(CHAIN_ID);
  process.env.VILLAIN_SESSION_KEY ??= VILLAIN_TEST_KEY;
  process.env.VILLAIN_PAYMENT_WEI ??= '500000000000000000';
  process.env.VILLAIN_TARGET_ADDRESS ??=
    '0xdddddddddddddddddddddddddddddddddddddddd';
  process.env.RILEY_SESSION_KEY ??= RILEY_TEST_KEY;
  process.env.RILEY_PAYMENT_WEI ??= '1000000000000000';
}

async function buildApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, AuthModule, DemoModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser(process.env.SESSION_SECRET));
  await app.init();
  return { app, prisma: moduleRef.get(PrismaService) };
}

/**
 * Exercises the real `/demo/beat/:n` route end to end against the local
 * Postgres instance: the `DEMO_ENABLED` 404, the 401/403 gating, beat-number
 * validation, and the 422 a fully-authorized caller gets when the showcase
 * owner has no wallet yet. The 422 is deliberately the furthest this suite
 * goes — every gate has passed by then, and one more step would submit a real
 * on-chain transaction, which an e2e run must never do.
 *
 * `demo.config.ts` is parsed at construction, so the flag-off case gets its
 * own testing module rather than sharing one.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Demo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let disabledApp: INestApplication;
  /** The showcase owner: its address is DEMO_OWNER_ADDRESS, and it is the
   * account the passing-session tests sign in with. */
  const ownerAccount = privateKeyToAccount(generatePrivateKey());
  const createdOwnerAddresses: string[] = [];
  const suiteStartedAt = new Date();

  beforeAll(async () => {
    primeBaseEnv();

    // The disabled app first — DemoGuard captures DEMO_ENABLED at construction.
    delete process.env.DEMO_ENABLED;
    ({ app: disabledApp } = await buildApp());

    process.env.DEMO_ENABLED = 'true';
    process.env.DEMO_TOKEN = DEMO_TOKEN;
    process.env.DEMO_OWNER_ADDRESS = ownerAccount.address;
    process.env.DEMO_COSIGN_PAYMENT_WEI = '20000000000000000';
    ({ app, prisma } = await buildApp());
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { address: { in: createdOwnerAddresses } },
    });
    await prisma.siweNonce.deleteMany({
      where: { address: { in: createdOwnerAddresses } },
    });
    await app.close();
    await disabledApp.close();
    delete process.env.DEMO_ENABLED;
    delete process.env.DEMO_TOKEN;
    delete process.env.DEMO_OWNER_ADDRESS;
    delete process.env.DEMO_COSIGN_PAYMENT_WEI;
  });

  async function signIn(
    target: INestApplication,
    account = privateKeyToAccount(generatePrivateKey()),
  ) {
    createdOwnerAddresses.push(account.address.toLowerCase());
    const { body: nonceBody } = await request(target.getHttpServer())
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

    const verifyRes = await request(target.getHttpServer())
      .post('/auth/verify')
      .send({ message, signature })
      .expect(201);

    return verifyRes.headers['set-cookie'];
  }

  it('boots and self-registers the villain as a real VILLAIN Agent row', async () => {
    const villain = await prisma.agent.findUniqueOrThrow({
      where: {
        address: privateKeyToAccount(VILLAIN_TEST_KEY).address.toLowerCase(),
      },
    });
    expect(villain.kind).toBe(AgentKind.VILLAIN);
    expect(villain.keyEnvVar).toBe('VILLAIN_SESSION_KEY');
  });

  it('404s when DEMO_ENABLED is off, even for a signed-in caller', async () => {
    const cookie = await signIn(disabledApp, ownerAccount);
    await request(disabledApp.getHttpServer())
      .post('/demo/beat/1')
      .set('Cookie', cookie)
      .set(DEMO_TOKEN_HEADER, DEMO_TOKEN)
      .expect(404);
  });

  it('401s with no session', async () => {
    await request(app.getHttpServer())
      .post('/demo/beat/1')
      .set(DEMO_TOKEN_HEADER, DEMO_TOKEN)
      .expect(401);
  });

  it('403s a signed-in wallet that is not the showcase owner', async () => {
    const cookie = await signIn(app);
    await request(app.getHttpServer())
      .post('/demo/beat/1')
      .set('Cookie', cookie)
      .set(DEMO_TOKEN_HEADER, DEMO_TOKEN)
      .expect(403);
  });

  it('403s the showcase owner without the demo token header', async () => {
    const cookie = await signIn(app, ownerAccount);
    await request(app.getHttpServer())
      .post('/demo/beat/1')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('403s the showcase owner with a wrong demo token', async () => {
    const cookie = await signIn(app, ownerAccount);
    await request(app.getHttpServer())
      .post('/demo/beat/1')
      .set('Cookie', cookie)
      .set(DEMO_TOKEN_HEADER, 'not-the-token')
      .expect(403);
  });

  it('never leaks the demo token in a rejection body', async () => {
    const cookie = await signIn(app, ownerAccount);
    const res = await request(app.getHttpServer())
      .post('/demo/beat/1')
      .set('Cookie', cookie)
      .set(DEMO_TOKEN_HEADER, 'not-the-token')
      .expect(403);
    expect(JSON.stringify(res.body)).not.toContain(DEMO_TOKEN);
  });

  it.each(['0', '4', 'abc', '1.5', '0x1', '1e0', '%201', '+1'])(
    '400s beat number %s',
    async (n) => {
      const cookie = await signIn(app, ownerAccount);
      await request(app.getHttpServer())
        .post(`/demo/beat/${n}`)
        .set('Cookie', cookie)
        .set(DEMO_TOKEN_HEADER, DEMO_TOKEN)
        .expect(400);
    },
  );

  it.each([1, 2, 3])(
    'beat %i passes every gate and 422s only because the showcase owner has no wallet',
    async (n) => {
      const cookie = await signIn(app, ownerAccount);
      const res = await request(app.getHttpServer())
        .post(`/demo/beat/${n}`)
        .set('Cookie', cookie)
        .set(DEMO_TOKEN_HEADER, DEMO_TOKEN)
        .expect(422);
      expect(res.body.message).toMatch(/no Handler wallet yet/i);

      // Pre-flight failures record nothing: no run, and nothing on-chain.
      // Scoped to this run's own window — a developer database may already
      // hold DemoRun rows from a real beat.
      const runs = await prisma.demoRun.count({
        where: { beat: n, createdAt: { gte: suiteStartedAt } },
      });
      expect(runs).toBe(0);
    },
  );
});
