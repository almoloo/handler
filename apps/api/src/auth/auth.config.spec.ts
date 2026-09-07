import { describe, expect, it } from 'vitest';
import { parseAuthEnv } from './auth.config.js';

describe('parseAuthEnv', () => {
  it('applies defaults when only the secret is set', () => {
    const env = parseAuthEnv({ SESSION_SECRET: 'a'.repeat(32) });
    expect(env.SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);
    expect(env.SIWE_NONCE_TTL_SECONDS).toBe(5 * 60);
    expect(env.SIWE_DOMAIN).toBe('localhost');
    expect(env.SIWE_CHAIN_ID).toBe(31337);
  });

  it('parses valid overrides', () => {
    const env = parseAuthEnv({
      SESSION_SECRET: 'a'.repeat(32),
      SESSION_TTL_SECONDS: '3600',
      SIWE_NONCE_TTL_SECONDS: '120',
      SIWE_DOMAIN: 'handler.example',
      SIWE_CHAIN_ID: '84532',
    });
    expect(env.SESSION_TTL_SECONDS).toBe(3600);
    expect(env.SIWE_NONCE_TTL_SECONDS).toBe(120);
    expect(env.SIWE_DOMAIN).toBe('handler.example');
    expect(env.SIWE_CHAIN_ID).toBe(84532);
  });

  it('throws when SESSION_SECRET is missing', () => {
    expect(() => parseAuthEnv({})).toThrow(/Invalid auth environment/);
  });

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => parseAuthEnv({ SESSION_SECRET: 'short' })).toThrow(
      /Invalid auth environment/,
    );
  });
});
