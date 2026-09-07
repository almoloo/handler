import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Exercises the real /auth routes end to end (nonce → verify → session → logout,
 * plus the 401 path) against the local Postgres instance, per
 * context/coding-standards.md's e2e requirement for every controller route.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running —
 * same DATABASE_URL as the app itself.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const DOMAIN = 'localhost';
  const URI = 'http://localhost';
  const CHAIN_ID = 31337;

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'e'.repeat(32);
    process.env.SIWE_DOMAIN ??= DOMAIN;
    process.env.SIWE_CHAIN_ID ??= String(CHAIN_ID);

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.SESSION_SECRET));
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Cleans up rows this spec created so repeated runs stay idempotent — matches
    // context/coding-standards.md's rule against test data leaking into shared state.
    // Must run before app.close(), which disconnects the Prisma client.
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

  it('GET /auth/session returns 401 with no session cookie', async () => {
    await request(app.getHttpServer()).get('/auth/session').expect(401);
  });

  it('POST /auth/logout returns 401 with no session cookie', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(401);
  });

  it('completes nonce → verify → session → logout, then rejects the revoked session', async () => {
    const { address, cookie } = await signIn();

    const sessionRes = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(sessionRes.body.address).toBe(address);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(201);

    // The session row is gone, so the same cookie no longer authenticates.
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects a verify with a stale/reused nonce', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const { body: nonceBody } = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address: account.address })
      .expect(201);

    const buildMessage = () => {
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
      return siwe.prepareMessage();
    };

    const message = buildMessage();
    const signature = await account.signMessage({ message });

    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ message, signature })
      .expect(201);

    // Same nonce, second time: already consumed.
    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ message, signature })
      .expect(401);
  });
});
