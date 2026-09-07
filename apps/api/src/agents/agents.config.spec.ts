import { describe, expect, it } from 'vitest';
import { parseAgentsEnv } from './agents.config.js';

const VALID_ENV = {
  RILEY_SESSION_KEY:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  ONEINCH_API_KEY: 'test-key',
};

describe('parseAgentsEnv', () => {
  it('parses a valid environment', () => {
    const env = parseAgentsEnv(VALID_ENV);
    expect(env.RILEY_SESSION_KEY).toBe(VALID_ENV.RILEY_SESSION_KEY);
    expect(env.ONEINCH_API_KEY).toBe('test-key');
  });

  it('throws when RILEY_SESSION_KEY is missing', () => {
    expect(() =>
      parseAgentsEnv({ ONEINCH_API_KEY: 'test-key' }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_SESSION_KEY is not a 0x-prefixed 32-byte key', () => {
    expect(() =>
      parseAgentsEnv({ ...VALID_ENV, RILEY_SESSION_KEY: '0xdeadbeef' }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when ONEINCH_API_KEY is missing', () => {
    expect(() =>
      parseAgentsEnv({ RILEY_SESSION_KEY: VALID_ENV.RILEY_SESSION_KEY }),
    ).toThrow(/Invalid agents environment/);
  });
});
