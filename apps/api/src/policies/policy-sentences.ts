import { formatUsd } from '../common/format.js';
import { TrustTier } from '../generated/prisma/enums.js';

/** The slice of a `Policy` row {@link policySentences} needs. */
export type PolicyForSentences = {
  dailyCapUsd: bigint;
  perTxCapUsd: bigint;
  cosignAboveUsd: bigint;
  minCounterpartyTier: TrustTier;
  allowSwaps: boolean;
  allowUnknownContracts: boolean;
};

/**
 * Turns one `Policy` row into plain-English lines for the agent file / payroll
 * row (CLAUDE.md's no-jargon rule: no hex, no "session key", no enum names).
 */
export function policySentences(policy: PolicyForSentences): string[] {
  const sentences: string[] = [
    `Can spend up to ${formatUsd(policy.dailyCapUsd)} a day, ${formatUsd(policy.perTxCapUsd)} per transaction.`,
    `Needs your approval above ${formatUsd(policy.cosignAboveUsd)}.`,
  ];

  switch (policy.minCounterpartyTier) {
    case TrustTier.VERIFIED:
      sentences.push('Only pays agents rated Verified.');
      break;
    case TrustTier.NEW:
      sentences.push('Only pays agents rated New or higher.');
      break;
    case TrustTier.FLAGGED:
      // No restriction — every trust tier is accepted, so no line is added.
      break;
  }

  sentences.push(`Swaps: ${policy.allowSwaps ? 'allowed' : 'not allowed'}.`);
  sentences.push(
    `Unknown contracts: ${policy.allowUnknownContracts ? 'allowed' : 'not allowed'}.`,
  );

  return sentences;
}
