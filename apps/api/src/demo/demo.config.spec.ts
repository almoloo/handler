import { describe, expect, it } from 'vitest';
import { parseDemoEnv } from './demo.config.js';

const VALID_ENV = {
  DEMO_ENABLED: 'true',
  DEMO_TOKEN: 'a-long-enough-demo-token',
  DEMO_OWNER_ADDRESS: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  DEMO_COSIGN_PAYMENT_WEI: '20000000000000000',
};

describe('parseDemoEnv', () => {
  it('parses a valid enabled environment', () => {
    const env = parseDemoEnv(VALID_ENV);
    expect(env.enabled).toBe(true);
    if (!env.enabled) throw new Error('expected an enabled env');
    expect(env.DEMO_TOKEN).toBe(VALID_ENV.DEMO_TOKEN);
    expect(env.DEMO_OWNER_ADDRESS).toBe(VALID_ENV.DEMO_OWNER_ADDRESS);
    expect(env.DEMO_COSIGN_PAYMENT_WEI).toBe(20000000000000000n);
  });

  it('is disabled, not an error, when DEMO_ENABLED is unset', () => {
    expect(parseDemoEnv({})).toEqual({ enabled: false });
  });

  it('is disabled when DEMO_ENABLED is any value other than "true"', () => {
    expect(parseDemoEnv({ DEMO_ENABLED: 'false' })).toEqual({ enabled: false });
    expect(parseDemoEnv({ DEMO_ENABLED: '1' })).toEqual({ enabled: false });
  });

  it('ignores the other demo vars entirely while disabled', () => {
    expect(parseDemoEnv({ ...VALID_ENV, DEMO_ENABLED: 'false' })).toEqual({
      enabled: false,
    });
  });

  it('throws when enabled without DEMO_TOKEN', () => {
    const { DEMO_TOKEN: _omit, ...rest } = VALID_ENV;
    expect(() => parseDemoEnv(rest)).toThrow(/Invalid demo environment/);
  });

  it('throws when DEMO_TOKEN is too short to be a real secret', () => {
    expect(() => parseDemoEnv({ ...VALID_ENV, DEMO_TOKEN: 'changeme' })).toThrow(
      /Invalid demo environment/,
    );
  });

  it('throws when enabled without DEMO_OWNER_ADDRESS', () => {
    const { DEMO_OWNER_ADDRESS: _omit, ...rest } = VALID_ENV;
    expect(() => parseDemoEnv(rest)).toThrow(/Invalid demo environment/);
  });

  it('throws when DEMO_OWNER_ADDRESS is malformed', () => {
    expect(() =>
      parseDemoEnv({ ...VALID_ENV, DEMO_OWNER_ADDRESS: 'not-an-address' }),
    ).toThrow(/Invalid demo environment/);
  });

  it('throws when enabled without DEMO_COSIGN_PAYMENT_WEI', () => {
    const { DEMO_COSIGN_PAYMENT_WEI: _omit, ...rest } = VALID_ENV;
    expect(() => parseDemoEnv(rest)).toThrow(/Invalid demo environment/);
  });

  it('throws when DEMO_COSIGN_PAYMENT_WEI is zero', () => {
    expect(() =>
      parseDemoEnv({ ...VALID_ENV, DEMO_COSIGN_PAYMENT_WEI: '0' }),
    ).toThrow(/Invalid demo environment/);
  });
});
