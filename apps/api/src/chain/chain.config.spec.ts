import { describe, expect, it } from 'vitest';
import {
  parseChainEnv,
  resolveHandlerWalletAddress,
  resolveHandlerWalletFactoryAddress,
} from './chain.config.js';

describe('parseChainEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = parseChainEnv({});
    expect(env.CHAIN_RPC_URL).toBe('http://127.0.0.1:8545');
    expect(env.CHAIN_ID).toBe(31337);
  });

  it('parses valid overrides', () => {
    const env = parseChainEnv({
      CHAIN_RPC_URL: 'http://anvil:8545',
      CHAIN_ID: '31337',
    });
    expect(env.CHAIN_RPC_URL).toBe('http://anvil:8545');
    expect(env.CHAIN_ID).toBe(31337);
  });

  it('throws on an invalid CHAIN_RPC_URL', () => {
    expect(() => parseChainEnv({ CHAIN_RPC_URL: 'not-a-url' })).toThrow(
      /Invalid chain environment/,
    );
  });

  it('throws on a non-numeric CHAIN_ID', () => {
    expect(() => parseChainEnv({ CHAIN_ID: 'not-a-number' })).toThrow(
      /Invalid chain environment/,
    );
  });
});

describe('resolveHandlerWalletAddress', () => {
  it('resolves the configured address for chain 31337', () => {
    expect(resolveHandlerWalletAddress(31337)).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('throws for an unconfigured chain id', () => {
    expect(() => resolveHandlerWalletAddress(999999)).toThrow(
      /No HandlerWallet address configured/,
    );
  });

  // No configured chain currently has a still-placeholder handlerWallet address (Base
  // Sepolia's landed for real — see current-feature.md history), so the placeholder-throws
  // path is covered instead by resolveHandlerWalletFactoryAddress below, which does have a
  // genuine placeholder to test against (84532.factory).
});

describe('resolveHandlerWalletFactoryAddress', () => {
  it('resolves the configured address for chain 31337', () => {
    expect(resolveHandlerWalletFactoryAddress(31337)).toMatch(
      /^0x[0-9a-fA-F]{40}$/,
    );
  });

  it('returns null for an unconfigured chain id', () => {
    expect(resolveHandlerWalletFactoryAddress(999999)).toBeNull();
  });

  it('returns null for a configured but still-placeholder address (e.g. Base Sepolia "0x...")', () => {
    expect(resolveHandlerWalletFactoryAddress(84532)).toBeNull();
  });
});
