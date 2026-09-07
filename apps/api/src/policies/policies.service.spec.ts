import { describe, expect, it } from 'vitest';
import { PoliciesService } from './policies.service.js';

function makeService() {
  return new PoliciesService({} as never);
}

describe('PoliciesService.spentTodayUsd', () => {
  const EPOCH_START = 1_000_000n; // unix seconds

  it('reports the stored value before the 24h window elapses', () => {
    const service = makeService();
    const now = new Date(Number(EPOCH_START + 86_399n) * 1000);
    expect(
      service.spentTodayUsd(
        { epochStart: EPOCH_START, spentThisEpochUsd: 42_000_000n },
        now,
      ),
    ).toBe(42_000_000n);
  });

  it('reports the stored value exactly at the 24h boundary (not yet stale)', () => {
    const service = makeService();
    const now = new Date(Number(EPOCH_START + 86_400n) * 1000);
    expect(
      service.spentTodayUsd(
        { epochStart: EPOCH_START, spentThisEpochUsd: 42_000_000n },
        now,
      ),
    ).toBe(42_000_000n);
  });

  it('reports 0 once now is past the 24h window (stale, epoch not yet rolled on-chain)', () => {
    const service = makeService();
    const now = new Date(Number(EPOCH_START + 86_401n) * 1000);
    expect(
      service.spentTodayUsd(
        { epochStart: EPOCH_START, spentThisEpochUsd: 42_000_000n },
        now,
      ),
    ).toBe(0n);
  });
});
