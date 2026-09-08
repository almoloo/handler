import { describe, expect, it } from 'vitest';
import { parseVillainEnv } from './villain.config.js';

const VALID_ENV = {
  VILLAIN_SESSION_KEY:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff81',
  VILLAIN_PAYMENT_WEI: '500000000000000000',
  VILLAIN_TARGET_ADDRESS: '0xdddddddddddddddddddddddddddddddddddddddd',
};

describe('parseVillainEnv', () => {
  it('parses a valid environment', () => {
    const env = parseVillainEnv(VALID_ENV);
    expect(env.VILLAIN_SESSION_KEY).toBe(VALID_ENV.VILLAIN_SESSION_KEY);
    expect(env.VILLAIN_PAYMENT_WEI).toBe(500000000000000000n);
    expect(env.VILLAIN_TARGET_ADDRESS).toBe(VALID_ENV.VILLAIN_TARGET_ADDRESS);
  });

  it('throws when VILLAIN_SESSION_KEY is missing', () => {
    const { VILLAIN_SESSION_KEY: _omit, ...rest } = VALID_ENV;
    expect(() => parseVillainEnv(rest)).toThrow(/Invalid villain environment/);
  });

  it('throws when VILLAIN_SESSION_KEY is not a 0x-prefixed 32-byte key', () => {
    expect(() =>
      parseVillainEnv({ ...VALID_ENV, VILLAIN_SESSION_KEY: '0xdeadbeef' }),
    ).toThrow(/Invalid villain environment/);
  });

  it('throws when VILLAIN_PAYMENT_WEI is missing', () => {
    const { VILLAIN_PAYMENT_WEI: _omit, ...rest } = VALID_ENV;
    expect(() => parseVillainEnv(rest)).toThrow(/Invalid villain environment/);
  });

  it('throws when VILLAIN_PAYMENT_WEI is zero', () => {
    expect(() =>
      parseVillainEnv({ ...VALID_ENV, VILLAIN_PAYMENT_WEI: '0' }),
    ).toThrow(/Invalid villain environment/);
  });

  it('throws when VILLAIN_TARGET_ADDRESS is missing', () => {
    const { VILLAIN_TARGET_ADDRESS: _omit, ...rest } = VALID_ENV;
    expect(() => parseVillainEnv(rest)).toThrow(/Invalid villain environment/);
  });

  it('throws when VILLAIN_TARGET_ADDRESS is not a valid address', () => {
    expect(() =>
      parseVillainEnv({ ...VALID_ENV, VILLAIN_TARGET_ADDRESS: 'not-an-address' }),
    ).toThrow(/Invalid villain environment/);
  });
});
