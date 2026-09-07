import { describe, expect, it } from 'vitest';
import { parseActivityEnv } from './activity.config.js';

describe('parseActivityEnv', () => {
  it('applies the default poll interval when unset', () => {
    const env = parseActivityEnv({});
    expect(env.ACTIVITY_SSE_POLL_MS).toBe(2000);
  });

  it('parses a valid override', () => {
    const env = parseActivityEnv({ ACTIVITY_SSE_POLL_MS: '50' });
    expect(env.ACTIVITY_SSE_POLL_MS).toBe(50);
  });

  it('throws when the override is not a positive integer', () => {
    expect(() =>
      parseActivityEnv({ ACTIVITY_SSE_POLL_MS: '-1' }),
    ).toThrow(/Invalid activity environment/);
    expect(() =>
      parseActivityEnv({ ACTIVITY_SSE_POLL_MS: 'not-a-number' }),
    ).toThrow(/Invalid activity environment/);
  });
});
