import 'dotenv/config';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { ActivityModule } from '../src/activity/activity.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ActivityType, ActivitySource } from '../src/generated/prisma/enums.js';

/**
 * Exercises the real /activity and /events/stream routes end to end against
 * the local Postgres instance: 401-without-session on both, GET /activity's
 * empty-vs-real feed, filter narrowing, pagination, the two-wallet non-leak
 * case, filter rejection, and GET /events/stream's connect-and-receive-one-
 * event path — per context/coding-standards.md's e2e requirement and
 * current-feature.md's 5b spec. `ACTIVITY_SSE_POLL_MS` is overridden to a
 * small value so the SSE case stays fast, not flaky.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Activity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
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
    process.env.ACTIVITY_SSE_POLL_MS = '30';

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ActivityModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.SESSION_SECRET));
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({
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

    const cookie: string[] = verifyRes.headers['set-cookie'];
    return { address: account.address.toLowerCase(), cookie };
  }

  async function createWallet(owner: string) {
    const address = `0x${owner.slice(2, 10)}${'1'.repeat(32)}`;
    createdWalletAddresses.push(address);
    return prisma.wallet.create({
      data: { address, chainId: CHAIN_ID, owner },
    });
  }

  function cookieHeader(cookie: string[]): string {
    return cookie.map((c) => c.split(';')[0]).join('; ');
  }

  it('GET /activity and GET /events/stream return 401 with no session cookie', async () => {
    await request(app.getHttpServer()).get('/activity').expect(401);
    await request(app.getHttpServer()).get('/events/stream').expect(401);
  });

  it('GET /activity returns [] for a signed-in wallet with no rows yet', async () => {
    const owner = await signIn();
    const res = await request(app.getHttpServer())
      .get('/activity')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('GET /activity?filter=nonsense returns 400', async () => {
    const owner = await signIn();
    await request(app.getHttpServer())
      .get('/activity?filter=nonsense')
      .set('Cookie', owner.cookie)
      .expect(400);
  });

  it('GET /activity rejects a malformed before or out-of-range limit with 400', async () => {
    const owner = await signIn();
    await request(app.getHttpServer())
      .get('/activity?before=not-a-number')
      .set('Cookie', owner.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/activity?limit=0')
      .set('Cookie', owner.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/activity?limit=101')
      .set('Cookie', owner.cookie)
      .expect(400);
  });

  it('returns real rows, filters correctly, paginates, and never leaks another wallet\'s row', async () => {
    const ownerA = await signIn();
    const walletA = await createWallet(ownerA.address);
    const ownerB = await signIn();
    const walletB = await createWallet(ownerB.address);

    // Seed 3 rows for wallet A (oldest to newest) and 1 unrelated row for wallet B.
    await prisma.activityEvent.create({
      data: {
        walletAddress: walletA.address,
        type: ActivityType.SWAP,
        source: ActivitySource.CHAIN,
        summary: 'Riley swapped $10.00',
      },
    });
    await prisma.activityEvent.create({
      data: {
        walletAddress: walletA.address,
        type: ActivityType.BLOCKED,
        source: ActivitySource.CHAIN,
        summary: 'Blocked Villain',
      },
    });
    await prisma.activityEvent.create({
      data: {
        walletAddress: walletA.address,
        type: ActivityType.PENDING,
        source: ActivitySource.CHAIN,
        summary: 'Riley wants to send $500.00',
      },
    });
    await prisma.activityEvent.create({
      data: {
        walletAddress: walletB.address,
        type: ActivityType.SWAP,
        source: ActivitySource.CHAIN,
        summary: "Wallet B's own swap",
      },
    });

    // Two-wallet non-leak + newest-first ordering.
    const allA = await request(app.getHttpServer())
      .get('/activity')
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(allA.body.items).toHaveLength(3);
    expect(allA.body.items.map((i: { summary: string }) => i.summary)).toEqual([
      'Riley wants to send $500.00',
      'Blocked Villain',
      'Riley swapped $10.00',
    ]);
    expect(
      allA.body.items.every((i: { summary: string }) => i.summary !== "Wallet B's own swap"),
    ).toBe(true);

    // Filters.
    const blocked = await request(app.getHttpServer())
      .get('/activity?filter=blocked')
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(blocked.body.items).toHaveLength(1);
    expect(blocked.body.items[0].summary).toBe('Blocked Villain');

    const pending = await request(app.getHttpServer())
      .get('/activity?filter=pending')
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].summary).toBe('Riley wants to send $500.00');

    // Pagination: page 1 of 2, then the remainder via `before`.
    const page1 = await request(app.getHttpServer())
      .get('/activity?limit=2')
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get(`/activity?limit=2&before=${page1.body.nextCursor}`)
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].summary).toBe('Riley swapped $10.00');
    expect(page2.body.nextCursor).toBeNull();

    // Wallet B never sees wallet A's rows either.
    const allB = await request(app.getHttpServer())
      .get('/activity')
      .set('Cookie', ownerB.cookie)
      .expect(200);
    expect(allB.body.items).toHaveLength(1);
    expect(allB.body.items[0].summary).toBe("Wallet B's own swap");
  });

  it(
    'GET /events/stream connects and receives one MessageEvent after a row is seeded',
    async () => {
      const owner = await signIn();
      const wallet = await createWallet(owner.address);

      const received = await new Promise<string>((resolve, reject) => {
        const req = http.get(
          `${baseUrl}/events/stream`,
          { headers: { Cookie: cookieHeader(owner.cookie) } },
          (res) => {
            try {
              expect(res.statusCode).toBe(200);
              expect(res.headers['content-type']).toMatch(/text\/event-stream/);
            } catch (err) {
              // A thrown assertion here isn't otherwise wired to `reject` (this
              // callback runs outside the Promise executor's own try/catch), so
              // without this it would time out instead of reporting the real
              // failure.
              reject(err as Error);
              return;
            }
            let buffer = '';
            res.on('data', (chunk) => {
              buffer += chunk.toString();
              if (buffer.includes('\n\n')) {
                res.destroy();
                req.destroy();
                resolve(buffer);
              }
            });
            res.on('error', reject);
          },
        );
        req.on('error', reject);

        setTimeout(() => {
          prisma.activityEvent
            .create({
              data: {
                walletAddress: wallet.address,
                type: ActivityType.SWAP,
                source: ActivitySource.CHAIN,
                summary: 'Live-streamed swap',
              },
            })
            .catch(reject);
        }, 50);
      });

      expect(received).toContain('id:');
      expect(received).toContain('data:');
      expect(received).toContain('Live-streamed swap');
    },
    5000,
  );
});
