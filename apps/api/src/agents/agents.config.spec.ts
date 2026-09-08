import { describe, expect, it } from 'vitest';
import { parseAgentsEnv } from './agents.config.js';

const VALID_ENV = {
  RILEY_SESSION_KEY:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
};

describe('parseAgentsEnv', () => {
  it('parses a valid environment', () => {
    const env = parseAgentsEnv(VALID_ENV);
    expect(env.RILEY_SESSION_KEY).toBe(VALID_ENV.RILEY_SESSION_KEY);
  });

  it('throws when RILEY_SESSION_KEY is missing', () => {
    expect(() => parseAgentsEnv({})).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_SESSION_KEY is not a 0x-prefixed 32-byte key', () => {
    expect(() =>
      parseAgentsEnv({ ...VALID_ENV, RILEY_SESSION_KEY: '0xdeadbeef' }),
    ).toThrow(/Invalid agents environment/);
  });
});
