import { TrustTier, BlockReason } from '../generated/prisma/enums.js';
import { formatUsd } from './format.js';

/** Mirrors TrustReader's Tier enum ordering: FLAGGED=0, NEW=1, VERIFIED=2. */
const TIER_BY_INDEX: readonly TrustTier[] = [
  TrustTier.FLAGGED,
  TrustTier.NEW,
  TrustTier.VERIFIED,
];

/** Mirrors HandlerWallet's CallKind enum ordering: TRANSFER=0, SWAP=1. */
export function isSwapKind(kindIndex: number): boolean {
  return kindIndex === 1;
}

export function mapTier(tierIndex: number): TrustTier {
  const tier = TIER_BY_INDEX[tierIndex];
  if (!tier) throw new Error(`Unknown Tier index: ${tierIndex}`);
  return tier;
}

/** Shape of HandlerWallet's AgentPolicy struct as decoded by viem (event arg or contract read). */
export interface ChainPolicy {
  dailyCapUsd: bigint;
  perTxCapUsd: bigint;
  cosignAboveUsd: bigint;
  epochStart: bigint;
  spentThisEpoch: bigint;
  minCounterpartyTier: number;
  allowSwaps: boolean;
  allowUnknownContracts: boolean;
  frozen: boolean;
}

/** The public `policies(sessionKey)` getter returns 9 separate positional outputs, not a tuple object. */
export function policyFromContractTuple(
  tuple: readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    boolean,
    boolean,
    boolean,
  ],
): ChainPolicy {
  const [
    dailyCapUsd,
    perTxCapUsd,
    cosignAboveUsd,
    epochStart,
    spentThisEpoch,
    minCounterpartyTier,
    allowSwaps,
    allowUnknownContracts,
    frozen,
  ] = tuple;
  return {
    dailyCapUsd,
    perTxCapUsd,
    cosignAboveUsd,
    epochStart,
    spentThisEpoch,
    minCounterpartyTier,
    allowSwaps,
    allowUnknownContracts,
    frozen,
  };
}

/** Fields shared by Policy's `create` and `update` — the mirror of the on-chain AgentPolicy struct. */
export function toPolicyMirrorFields(policy: ChainPolicy) {
  return {
    dailyCapUsd: policy.dailyCapUsd,
    perTxCapUsd: policy.perTxCapUsd,
    cosignAboveUsd: policy.cosignAboveUsd,
    epochStart: policy.epochStart,
    spentThisEpochUsd: policy.spentThisEpoch,
    minCounterpartyTier: mapTier(policy.minCounterpartyTier),
    allowSwaps: policy.allowSwaps,
    allowUnknownContracts: policy.allowUnknownContracts,
    frozen: policy.frozen,
  };
}

export function hiredSummary(agentName: string): string {
  return `Hired ${agentName}`;
}

export function policyUpdatedSummary(agentName: string): string {
  return `Updated ${agentName}'s policy`;
}

export function frozenSummary(agentName: string, frozen: boolean): string {
  return frozen ? `Froze ${agentName}` : `Unfroze ${agentName}`;
}

/** Mirrors HandlerWallet's BlockReason enum ordering (contracts-roadmap §2.1). */
const BLOCK_REASON_BY_INDEX: readonly BlockReason[] = [
  BlockReason.AGENT_FROZEN,
  BlockReason.UNKNOWN_CONTRACT,
  BlockReason.SWAPS_NOT_ALLOWED,
  BlockReason.COUNTERPARTY_BELOW_TIER,
  BlockReason.EXCEEDS_PER_TX_CAP,
  BlockReason.EXCEEDS_DAILY_ALLOWANCE,
];

export function mapBlockReason(reasonIndex: number): BlockReason {
  const reason = BLOCK_REASON_BY_INDEX[reasonIndex];
  if (!reason) throw new Error(`Unknown BlockReason index: ${reasonIndex}`);
  return reason;
}

const BLOCK_REASON_TEXT: Record<BlockReason, string> = {
  [BlockReason.AGENT_FROZEN]: 'the agent is frozen',
  [BlockReason.UNKNOWN_CONTRACT]: "it's not an allowed contract",
  [BlockReason.SWAPS_NOT_ALLOWED]: "swaps aren't allowed",
  [BlockReason.COUNTERPARTY_BELOW_TIER]: 'the counterparty is unverified',
  [BlockReason.EXCEEDS_PER_TX_CAP]: "it's over the per-payment limit",
  [BlockReason.EXCEEDS_DAILY_ALLOWANCE]: "it's over today's allowance",
  [BlockReason.REQUIRES_COSIGN]: 'it needs your approval',
  [BlockReason.STALE_PRICE]: 'pricing data is stale',
  [BlockReason.OTHER]: 'of a policy rule',
};

export function blockedSummary(agentName: string, reason: BlockReason): string {
  return `Blocked ${agentName} — ${BLOCK_REASON_TEXT[reason]}`;
}

export function swapSummary(agentName: string, usd8: bigint): string {
  return `${agentName} swapped ${formatUsd(usd8)}`;
}

export function paymentSummary(
  agentName: string,
  counterpartyName: string,
  usd8: bigint,
): string {
  return `${agentName} paid ${counterpartyName} ${formatUsd(usd8)}`;
}

export function transferSummary(
  agentName: string,
  counterpartyName: string,
  usd8: bigint,
): string {
  return `${agentName} sent ${formatUsd(usd8)} to ${counterpartyName}`;
}

export function pendingSummary(
  agentName: string,
  counterpartyName: string,
  usd8: bigint,
): string {
  return `${agentName} wants to send ${formatUsd(usd8)} to ${counterpartyName} — needs your approval`;
}

export function pendingSwapSummary(agentName: string, usd8: bigint): string {
  return `${agentName} wants to swap ${formatUsd(usd8)} — needs your approval`;
}

export function approvedSummary(
  agentName: string,
  counterpartyName: string,
  usd8: bigint,
): string {
  return `Approved: ${agentName} sent ${formatUsd(usd8)} to ${counterpartyName}`;
}

export function deniedSummary(
  agentName: string,
  counterpartyName: string,
  usd8: bigint,
): string {
  return `Denied ${agentName}'s ${formatUsd(usd8)} request to ${counterpartyName}`;
}
