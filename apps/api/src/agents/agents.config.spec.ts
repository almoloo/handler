import { describe, expect, it } from 'vitest';
import { parseAgentsEnv } from './agents.config.js';

const VALID_ENV = {
  RILEY_SESSION_KEY:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  RILEY_PAYMENT_WEI: '1000000000000000',
};

describe('parseAgentsEnv', () => {
  it('parses a valid environment', () => {
    const env = parseAgentsEnv(VALID_ENV);
    expect(env.RILEY_SESSION_KEY).toBe(VALID_ENV.RILEY_SESSION_KEY);
    expect(env.RILEY_PAYMENT_WEI).toBe(1000000000000000n);
  });

  it('throws when RILEY_SESSION_KEY is missing', () => {
    expect(() =>
      parseAgentsEnv({ RILEY_PAYMENT_WEI: VALID_ENV.RILEY_PAYMENT_WEI }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_SESSION_KEY is not a 0x-prefixed 32-byte key', () => {
    expect(() =>
      parseAgentsEnv({ ...VALID_ENV, RILEY_SESSION_KEY: '0xdeadbeef' }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_PAYMENT_WEI is missing', () => {
    expect(() =>
      parseAgentsEnv({ RILEY_SESSION_KEY: VALID_ENV.RILEY_SESSION_KEY }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_PAYMENT_WEI is zero', () => {
    expect(() =>
      parseAgentsEnv({ ...VALID_ENV, RILEY_PAYMENT_WEI: '0' }),
    ).toThrow(/Invalid agents environment/);
  });

  it('throws when RILEY_PAYMENT_WEI is not an integer string', () => {
    expect(() =>
      parseAgentsEnv({ ...VALID_ENV, RILEY_PAYMENT_WEI: '0.5' }),
    ).toThrow(/Invalid agents environment/);
  });
});
