import { createWalletClient, type Address, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { ChainService } from './chain.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExecutionKind, IntentStatus } from '../generated/prisma/enums.js';

/** Mirrors `HandlerWallet`'s lazy 24h epoch roll (see `_rollEpoch` in the
 * contract and `PoliciesService.spentTodayUsd`) — must stay identical to
 * both or "spent today" and "already acted today" silently disagree. */
export const EPOCH_SECONDS = 86_400n;

/** The minimal slice of a `Policy` row {@link hasActedThisEpoch} needs. */
export type EpochPolicy = {
  walletAddress: string;
  epochStart: bigint;
};

/** Whether an agent has already planned/submitted/confirmed an action
 * against `target` for this wallet within the wallet's current on-chain
 * epoch window — shared by `AgentsService` (Riley paying the Subcontractor)
 * and `VillainService` (the villain's blocked-payment attempt) so both stay
 * identical to `PoliciesService.spentTodayUsd`'s epoch-boundary rule. A
 * prior `FAILED` attempt doesn't count, so it's retried on the next tick
 * instead of being skipped for the rest of the epoch. */
export async function hasActedThisEpoch(params: {
  prisma: PrismaService;
  policy: EpochPolicy;
  agentId: string;
  target: Address;
}): Promise<boolean> {
  const { prisma, policy, agentId, target } = params;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (nowSeconds > policy.epochStart + EPOCH_SECONDS) {
    return false;
  }
  const existing = await prisma.intent.findFirst({
    where: {
      walletAddress: policy.walletAddress,
      agentId,
      target: target.toLowerCase(),
      createdAt: { gte: new Date(Number(policy.epochStart) * 1000) },
      status: { not: IntentStatus.FAILED },
    },
    select: { id: true },
  });
  return existing !== null;
}

/** The `Policy` slice a single-wallet, on-demand payment needs. */
export type HiredPolicy = { id: string; agentId: string };

/**
 * Resolves one wallet's active policy for one agent, for the `/demo`
 * director's single-wallet entry points — the on-demand counterpart to the
 * cron's "every wallet that hired me" `policy.findMany`. Shared by
 * `AgentsService.payWalletForDemo` and `VillainService.attemptForDemo`.
 *
 * Both failure modes throw with an operator-readable message rather than
 * returning `null`: a beat that quietly did nothing is worse mid-take than a
 * beat that says why. Neither is recoverable in code — hiring and unfreezing
 * are owner-signed actions taken in the app.
 */
export async function resolveHiredPolicy(params: {
  prisma: PrismaService;
  agentAddress: Address;
  agentName: string;
  walletAddress: string;
}): Promise<HiredPolicy> {
  const { prisma, agentAddress, agentName, walletAddress } = params;

  const agent = await prisma.agent.findUnique({
    where: { address: agentAddress.toLowerCase() },
    select: { id: true },
  });
  if (!agent) {
    throw new Error(
      `${agentName} has no agent row yet — the API registers it on boot, so this means it hasn't started cleanly.`,
    );
  }

  const policy = await prisma.policy.findFirst({
    where: { agentId: agent.id, walletAddress: walletAddress.toLowerCase() },
    select: { id: true, frozen: true },
  });
  if (!policy) {
    throw new Error(
      `${agentName} hasn't been hired by the showcase wallet yet — hire it from the app first (session key ${agentAddress}).`,
    );
  }
  if (policy.frozen) {
    throw new Error(
      `${agentName} is frozen for the showcase wallet — unfreeze it from the app first.`,
    );
  }

  return { id: policy.id, agentId: agent.id };
}

/** Writes the `Intent` row before submitting the tx (backend-roadmap §4.2's
 * "intent row first" rule), then calls `tryExecute` via the agent's own
 * session-key signer. A submit-time throw (no tx hash yet, e.g. an RPC error
 * or a simulated revert) marks the `Intent` `FAILED` directly. A
 * successfully broadcast tx that still reverts on-chain (e.g. the wallet's
 * own ETH balance can't cover the transfer) emits no `Executed`/
 * `ExecutionBlocked` log for the indexer to link back to this `Intent`, so
 * this also awaits the receipt and marks it `FAILED` on a reverted status
 * rather than leaving it stuck at `SUBMITTED` forever. Shared by
 * `AgentsService.payWallet` and `VillainService.payWallet` — the only
 * difference between a real payment and the villain's deliberately-blocked
 * one is which `target`/`valueWei` the caller passes in; the contract's own
 * checks decide whether it executes or blocks.
 *
 * `demoRunId` is the one demo-aware parameter: when the `/demo` director
 * triggered this payment, the `Intent` row is linked back to its `DemoRun`
 * so an operator can see which run produced which on-chain attempt. It
 * changes nothing about the call itself — a beat submits exactly the tx the
 * cron would. */
export async function submitAgentPayment(params: {
  prisma: PrismaService;
  chain: ChainService;
  account: PrivateKeyAccount;
  walletClient: ReturnType<typeof createWalletClient>;
  walletAddress: Address;
  policyId: string;
  agentId: string;
  target: Address;
  valueWei: bigint;
  /** Set only when the `/demo` director triggered this payment. */
  demoRunId?: string;
}): Promise<void> {
  const {
    prisma,
    chain,
    account,
    walletClient,
    walletAddress,
    policyId,
    agentId,
    target,
    valueWei,
    demoRunId,
  } = params;

  const intent = await prisma.intent.create({
    data: {
      walletAddress,
      policyId,
      agentId,
      kind: ExecutionKind.AGENT_PAYMENT,
      target: target.toLowerCase(),
      valueRaw: valueWei.toString(),
      calldata: '0x',
      status: IntentStatus.PLANNED,
      demoRunId: demoRunId ?? null,
    },
  });

  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      chain: null,
      account,
      address: walletAddress,
      abi: chain.handlerWalletAbi,
      functionName: 'tryExecute',
      args: [{ target, data: '0x', value: valueWei }],
    });
  } catch (error) {
    await prisma.intent.update({
      where: { id: intent.id },
      data: { status: IntentStatus.FAILED, error: String(error) },
    });
    return;
  }

  await prisma.intent.update({
    where: { id: intent.id },
    data: { status: IntentStatus.SUBMITTED, txHash, submittedAt: new Date() },
  });

  const receipt = await chain.publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  if (receipt.status === 'reverted') {
    await prisma.intent.update({
      where: { id: intent.id },
      data: { status: IntentStatus.FAILED, error: 'Transaction reverted on-chain' },
    });
  }
}
