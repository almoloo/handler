import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { ApprovalsModule } from '../src/approvals/approvals.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AgentKind, ApprovalStatus, TrustTier } from '../src/generated/prisma/enums.js';

/**
 * Exercises the real /approvals/:id route end to end against the local
 * Postgres instance: 401 with no session, 404 for an unknown id, 404 (never
 * distinguishable from "unknown") for an approval belonging to a different
 * wallet, and the real 200 shape, per current-feature.md's 6b spec.
 * Requires `pnpm dev:chain` (or an equivalent local Postgres) to be running.
 */
describe('Approvals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const DOMAIN = 'localhost';
  const URI = 'http://localhost';
  const CHAIN_ID = 31337;

  const createdWalletAddresses: string[] = [];
  const createdOwnerAddresses: string[] = [];
  const createdAgentIds: string[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'e'.repeat(32);
    process.env.SIWE_DOMAIN ??= DOMAIN;
    process.env.SIWE_CHAIN_ID ??= String(CHAIN_ID);

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ApprovalsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.SESSION_SECRET));
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.pendingApproval.deleteMany({
      where: { walletAddress: { in: createdWalletAddresses } },
    });
    await prisma.policy.deleteMany({
      where: { walletAddress: { in: createdWalletAddresses } },
    });
    await prisma.wallet.deleteMany({
      where: { address: { in: createdWalletAddresses } },
    });
    await prisma.agent.deleteMany({ where: { id: { in: createdAgentIds } } });
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

  async function createAgent() {
    const account = privateKeyToAccount(generatePrivateKey());
    const agent = await prisma.agent.create({
      data: {
        address: account.address.toLowerCase(),
        name: 'Riley',
        kind: AgentKind.HIRED,
        trustTier: TrustTier.VERIFIED,
        trustSummary: 'Verified — 214 attested jobs',
      },
    });
    createdAgentIds.push(agent.id);
    return agent;
  }

  async function createApprovalFor(
    walletAddress: string,
    policyId: string,
    agentId: string,
    id: string,
  ) {
    return prisma.pendingApproval.create({
      data: {
        id,
        walletAddress,
        policyId,
        agentId,
        amountUsd: 120_00000000n,
        target: '0xtarget00000000000000000000000000000000',
        calldata: '0x',
        summary: 'Riley wants to pay Atlas $120 for data labeling.',
        status: ApprovalStatus.PENDING,
        proposedTxHash: `0x${'1'.repeat(64)}`,
        proposedBlock: 1n,
        proposedAt: new Date(),
      },
    });
  }

  it('GET /approvals/:id returns 401 with no session cookie', async () => {
    await request(app.getHttpServer()).get('/approvals/0xanything').expect(401);
  });

  it('GET /approvals/:id returns 404 for an id that does not exist', async () => {
    const owner = await signIn();
    await request(app.getHttpServer())
      .get('/approvals/0xdoes-not-exist')
      .set('Cookie', owner.cookie)
      .expect(404);
  });

  it('GET /approvals/:id returns 404 (not the real row) for an approval belonging to a different wallet', async () => {
    const agent = await createAgent();
    const owner = await signIn();
    const wallet = await createWallet(owner.address);
    const policy = await prisma.policy.create({
      data: {
        walletAddress: wallet.address,
        agentId: agent.id,
        sessionKey: agent.address,
        dailyCapUsd: 500_00000000n,
        perTxCapUsd: 150_00000000n,
        cosignAboveUsd: 300_00000000n,
        minCounterpartyTier: TrustTier.NEW,
        allowSwaps: true,
        allowUnknownContracts: false,
      },
    });
    const approvalId = `0x${'c'.repeat(64)}`;
    await createApprovalFor(wallet.address, policy.id, agent.id, approvalId);

    const otherOwner = await signIn();
    await request(app.getHttpServer())
      .get(`/approvals/${approvalId}`)
      .set('Cookie', otherOwner.cookie)
      .expect(404);
  });

  it('GET /approvals/:id returns the real shape for the owning wallet', async () => {
    const agent = await createAgent();
    const owner = await signIn();
    const wallet = await createWallet(owner.address);
    const policy = await prisma.policy.create({
      data: {
        walletAddress: wallet.address,
        agentId: agent.id,
        sessionKey: agent.address,
        dailyCapUsd: 500_00000000n,
        perTxCapUsd: 150_00000000n,
        cosignAboveUsd: 300_00000000n,
        minCounterpartyTier: TrustTier.NEW,
        allowSwaps: true,
        allowUnknownContracts: false,
      },
    });
    const approvalId = `0x${'d'.repeat(64)}`;
    await createApprovalFor(wallet.address, policy.id, agent.id, approvalId);

    const res = await request(app.getHttpServer())
      .get(`/approvals/${approvalId}`)
      .set('Cookie', owner.cookie)
      .expect(200);

    expect(res.body).toMatchObject({
      id: approvalId,
      status: ApprovalStatus.PENDING,
      amountUsd: '12000000000',
      summary: 'Riley wants to pay Atlas $120 for data labeling.',
      agent: {
        id: agent.id,
        name: 'Riley',
        trustTier: TrustTier.VERIFIED,
      },
      counterparty: null,
    });
  });
});
