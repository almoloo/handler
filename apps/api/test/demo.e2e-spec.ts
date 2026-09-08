import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { DemoModule } from '../src/demo/demo.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AgentKind } from '../src/generated/prisma/enums.js';

const VILLAIN_TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff81';

/**
 * Boot-proof for `DemoModule` (current-feature.md's 7b spec, step 5): no
 * controller/routes exist yet — this just confirms the module compiles and
 * initializes with the new required env vars set, and that `VillainService`
 * self-registers its real `Agent` row on boot, mirroring
 * `agents.e2e-spec.ts`'s precedent.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Demo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.VILLAIN_SESSION_KEY ??= VILLAIN_TEST_KEY;
    process.env.VILLAIN_PAYMENT_WEI ??= '500000000000000000';
    process.env.VILLAIN_TARGET_ADDRESS ??=
      '0xdddddddddddddddddddddddddddddddddddddddd';

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, DemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots and self-registers the villain as a real VILLAIN Agent row', async () => {
    const villain = await prisma.agent.findUniqueOrThrow({
      where: { address: privateKeyToAccount(VILLAIN_TEST_KEY).address.toLowerCase() },
    });
    expect(villain.kind).toBe(AgentKind.VILLAIN);
    expect(villain.keyEnvVar).toBe('VILLAIN_SESSION_KEY');
  });
});
