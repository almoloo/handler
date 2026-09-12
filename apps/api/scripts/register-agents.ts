/**
 * Disclosed, one-time setup script (backend-roadmap.md §4.3 / contracts-roadmap.md
 * §2.2): registers Handler's two showcase counterparties in the *real* ERC-8004
 * Identity + Reputation registries, so their trust tiers are earned the same way
 * any user's counterparty's would be — not written by the product at runtime.
 *
 *   - "Subcontractor": registered, given 3 real feedback entries (score 90/100,
 *     above TrustReader's VERIFIED_MIN_SCORE_WAD threshold) -> resolves VERIFIED.
 *   - "New Agent": registered, given no feedback -> resolves NEW.
 *
 * Idempotent: re-running skips identity registration and feedback for any
 * showcase agent whose `Agent` row already has an `erc8004AgentId` (redoing
 * those would mint a second, unused agentId / duplicate feedback on the real
 * registries). `syncAgent` always re-runs against the *currently configured*
 * `TrustReader`, though — its cache is local to that contract, so a re-run is
 * also how an already-registered agent gets re-warmed onto a freshly
 * deployed `TrustReader` (e.g. after a redeploy for a contract fix).
 *
 * Usage: `pnpm --filter api register-agents` against a running `pnpm dev:chain`.
 */
import 'dotenv/config';
import { z } from 'zod';
import {
  createWalletClient,
  http,
  type Hex,
  type PrivateKeyAccount,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { trustReaderAbi } from '@handler/contracts';
import { ChainService } from '../src/chain/chain.service.js';
import { parseChainEnv } from '../src/chain/chain.config.js';
import { TrustService, type TrustConfig } from '../src/trust/trust.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AgentKind } from '../src/generated/prisma/enums.js';

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte private key');

const envSchema = z.object({
  SHOWCASE_SUBCONTRACTOR_KEY: hexPrivateKey,
  SHOWCASE_NEW_AGENT_KEY: hexPrivateKey,
  SHOWCASE_FEEDBACK_CLIENT_KEY: hexPrivateKey,
});

/** Script-local slice of the real ERC-8004 registries' *write* surface — our own
 * contracts only ever need the read slice (see src/interfaces/erc8004/*.sol), so
 * `register`/`giveFeedback` aren't in the generated ABIs. Verified against the
 * deployed IdentityRegistryUpgradeable/ReputationRegistryUpgradeable source
 * (erc-8004/erc-8004-contracts). */
const identityRegisterAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
] as const;

const reputationGiveFeedbackAbi = [
  {
    type: 'function',
    name: 'giveFeedback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;
/** 0-100 convention (see TrustReader.sol) — comfortably above VERIFIED_MIN_SCORE_WAD (80). */
const VERIFIED_FEEDBACK_SCORE = 90n;

type RegisterOptions = {
  chain: ChainService;
  prisma: PrismaService;
  config: TrustConfig;
  account: PrivateKeyAccount;
  name: string;
  description: string;
  /** Omit for a showcase agent that should stay NEW (no feedback given). */
  feedback?: { from: PrivateKeyAccount; count: number };
};

/** Warms `TrustReader.tierOf()`'s cache for `agentId` against whichever
 * `TrustReader` `config.trustReaderAddress` currently resolves to. Run on
 * every `registerShowcaseAgent` call — including the already-registered
 * early return — since the cache is local to that one contract instance and
 * empty on any freshly deployed `TrustReader`. */
async function syncTrustReader(opts: {
  chain: ChainService;
  config: TrustConfig;
  walletClient: ReturnType<typeof createWalletClient>;
  account: PrivateKeyAccount;
  agentId: bigint;
  label: string;
}) {
  const syncHash = await opts.walletClient.writeContract({
    chain: null,
    account: opts.account,
    address: opts.config.trustReaderAddress,
    abi: trustReaderAbi,
    functionName: 'syncAgent',
    args: [opts.agentId],
  });
  await opts.chain.publicClient.waitForTransactionReceipt({ hash: syncHash });
  console.log(`${opts.label}: synced TrustReader cache for agentId ${opts.agentId}`);
}

async function registerShowcaseAgent(opts: RegisterOptions) {
  const address = opts.account.address.toLowerCase();
  const rpcUrl = parseChainEnv().CHAIN_RPC_URL;

  const walletClient = createWalletClient({
    account: opts.account,
    transport: http(rpcUrl),
  });

  // Idempotency is checked against our own DB, not on-chain state: if the process
  // dies after `register()` succeeds but before the final upsert below (e.g. killed
  // mid-feedback-loop), a re-run won't see this agent's row and will mint a second,
  // orphaned agentId for the same key. Acceptable for a manual, one-time operator
  // script — if that happens, just re-run again (harmless waste, not a double-spend).
  const existing = await opts.prisma.agent.findUnique({ where: { address } });
  if (existing?.erc8004AgentId != null) {
    console.log(
      `${opts.name}: already registered (agentId ${existing.erc8004AgentId}) — skipping`,
    );
    // Identity/feedback are already on the real registries and must never be
    // redone, but TrustReader's sync cache is local to whichever contract is
    // currently configured — re-sync so a redeploy doesn't leave this agent
    // unresolvable.
    await syncTrustReader({
      chain: opts.chain,
      config: opts.config,
      walletClient,
      account: opts.account,
      agentId: existing.erc8004AgentId,
      label: opts.name,
    });
    return;
  }

  const { result: agentId, request } = await opts.chain.publicClient.simulateContract({
    account: opts.account,
    address: opts.config.identityRegistryAddress,
    abi: identityRegisterAbi,
    functionName: 'register',
    args: [''],
  });
  const registerHash = await walletClient.writeContract(request);
  await opts.chain.publicClient.waitForTransactionReceipt({ hash: registerHash });
  console.log(`${opts.name}: registered agentId ${agentId} (wallet ${address})`);

  if (opts.feedback) {
    const feedbackWalletClient = createWalletClient({
      account: opts.feedback.from,
      transport: http(rpcUrl),
    });
    for (let i = 0; i < opts.feedback.count; i++) {
      const hash = await feedbackWalletClient.writeContract({
        chain: null,
        account: opts.feedback.from,
        address: opts.config.reputationRegistryAddress,
        abi: reputationGiveFeedbackAbi,
        functionName: 'giveFeedback',
        args: [agentId, VERIFIED_FEEDBACK_SCORE, 0, '', '', '', '', ZERO_BYTES32],
      });
      await opts.chain.publicClient.waitForTransactionReceipt({ hash });
    }
    console.log(
      `${opts.name}: recorded ${opts.feedback.count} feedback entries (score ${VERIFIED_FEEDBACK_SCORE})`,
    );
  }

  await syncTrustReader({
    chain: opts.chain,
    config: opts.config,
    walletClient,
    account: opts.account,
    agentId,
    label: opts.name,
  });

  await opts.prisma.agent.upsert({
    where: { address },
    update: {
      name: opts.name,
      description: opts.description,
      kind: AgentKind.COUNTERPARTY,
      erc8004AgentId: agentId,
    },
    create: {
      address,
      name: opts.name,
      description: opts.description,
      kind: AgentKind.COUNTERPARTY,
      erc8004AgentId: agentId,
    },
  });
  console.log(`${opts.name}: Agent row upserted`);
}

async function main() {
  const env = envSchema.parse(process.env);

  const chain = new ChainService();
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const trust = new TrustService(chain, prisma);
    const config = await trust.getTrustConfig();

    const subcontractor = privateKeyToAccount(
      env.SHOWCASE_SUBCONTRACTOR_KEY as Hex,
    );
    const newAgent = privateKeyToAccount(env.SHOWCASE_NEW_AGENT_KEY as Hex);
    const feedbackClient = privateKeyToAccount(
      env.SHOWCASE_FEEDBACK_CLIENT_KEY as Hex,
    );

    await registerShowcaseAgent({
      chain,
      prisma,
      config,
      account: subcontractor,
      name: 'Subcontractor',
      description: 'A verified counterparty Riley pays for completed work.',
      feedback: { from: feedbackClient, count: 3 },
    });

    await registerShowcaseAgent({
      chain,
      prisma,
      config,
      account: newAgent,
      name: 'New Agent',
      description: 'A newly registered counterparty with no track record yet.',
    });
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
