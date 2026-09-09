import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PricesModule } from '../src/prices/prices.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Exercises the real GET /prices route end to end against the local Postgres
 * instance, per context/coding-standards.md's e2e requirement. The one thing
 * this route must prove that no other route does: it is genuinely public —
 * no session cookie is ever sent here. Requires `pnpm dev:chain` (or an
 * equivalent local Postgres) to be running; no live chain RPC is required —
 * a failed/absent chain read is a valid, tested response shape (stale/null),
 * not a test failure, per prices.service.spec.ts's unit coverage of that path.
 */
describe('Prices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.CHAIN_ID ??= '8453';

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, PricesModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Clears rows this spec's chain reads may have written, so repeated runs
    // stay idempotent — mirrors auth.e2e-spec.ts's own-rows-only cleanup.
    await prisma.priceSnapshot.deleteMany({ where: { symbol: { in: ['ETH', 'USDC'] } } });
    await app.close();
  });

  it('answers with no session cookie at all', async () => {
    const res = await request(app.getHttpServer()).get('/prices');

    expect(res.status).toBe(200);
  });

  it('returns both ETH and USDC in the documented shape', async () => {
    const res = await request(app.getHttpServer()).get('/prices');

    expect(res.status).toBe(200);
    for (const symbol of ['ETH', 'USDC'] as const) {
      expect(res.body).toHaveProperty(symbol);
      const quote = res.body[symbol];
      expect(quote).toHaveProperty('priceUsd');
      expect(quote).toHaveProperty('feedUpdatedAt');
      expect(typeof quote.stale).toBe('boolean');
      // Whatever this sandbox's chain access looks like, a fixed-point USD
      // string is never a bare number — the boundary rule from
      // coding-standards.md's Money & Units section.
      if (quote.priceUsd !== null) {
        expect(typeof quote.priceUsd).toBe('string');
      }
    }
  });
});
