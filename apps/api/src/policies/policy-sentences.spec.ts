import { describe, expect, it } from 'vitest';
import { policySentences, type PolicyForSentences } from './policy-sentences.js';
import { TrustTier } from '../generated/prisma/enums.js';

const BASE: PolicyForSentences = {
  dailyCapUsd: 50_000_000_000n, // $500.00
  perTxCapUsd: 15_000_000_000n, // $150.00
  cosignAboveUsd: 30_000_000_000n, // $300.00
  minCounterpartyTier: TrustTier.FLAGGED,
  allowSwaps: true,
  allowUnknownContracts: false,
};

describe('policySentences', () => {
  it('always states the daily and per-transaction caps', () => {
    const sentences = policySentences(BASE);
    expect(sentences).toContain(
      'Can spend up to $500.00 a day, $150.00 per transaction.',
    );
  });

  it('always states the cosign threshold', () => {
    const sentences = policySentences(BASE);
    expect(sentences).toContain('Needs your approval above $300.00.');
  });

  it('adds no tier line when the minimum tier is FLAGGED (no restriction)', () => {
    const sentences = policySentences({
      ...BASE,
      minCounterpartyTier: TrustTier.FLAGGED,
    });
    expect(sentences.some((s) => s.includes('Only pays agents'))).toBe(false);
  });

  it('states "New or higher" when the minimum tier is NEW', () => {
    const sentences = policySentences({
      ...BASE,
      minCounterpartyTier: TrustTier.NEW,
    });
    expect(sentences).toContain('Only pays agents rated New or higher.');
  });

  it('states "Verified" when the minimum tier is VERIFIED', () => {
    const sentences = policySentences({
      ...BASE,
      minCounterpartyTier: TrustTier.VERIFIED,
    });
    expect(sentences).toContain('Only pays agents rated Verified.');
  });

  it('states swaps are allowed', () => {
    const sentences = policySentences({ ...BASE, allowSwaps: true });
    expect(sentences).toContain('Swaps: allowed.');
  });

  it('states swaps are not allowed', () => {
    const sentences = policySentences({ ...BASE, allowSwaps: false });
    expect(sentences).toContain('Swaps: not allowed.');
  });

  it('states unknown contracts are allowed', () => {
    const sentences = policySentences({
      ...BASE,
      allowUnknownContracts: true,
    });
    expect(sentences).toContain('Unknown contracts: allowed.');
  });

  it('states unknown contracts are not allowed', () => {
    const sentences = policySentences({
      ...BASE,
      allowUnknownContracts: false,
    });
    expect(sentences).toContain('Unknown contracts: not allowed.');
  });
});
