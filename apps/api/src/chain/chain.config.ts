import { z } from 'zod';
import { addresses } from '@handler/contracts/addresses';
import { isAddress, type Address } from 'viem';

export const chainEnvSchema = z.object({
  CHAIN_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
});

export type ChainEnv = z.infer<typeof chainEnvSchema>;

/** Fail fast on an invalid chain env, per context/coding-standards.md. */
export function parseChainEnv(
  env: Record<string, string | undefined> = process.env,
): ChainEnv {
  const result = chainEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid chain environment: ${result.error.message}`);
  }
  return result.data;
}

/** Looks up the configured HandlerWallet address for a chain id, per @handler/contracts/addresses.
 * Validates it's a real address (not the "0x..." placeholder an unfilled deployment entry
 * leaves behind) so a misconfigured chain id fails fast at startup, matching this file's
 * "fail fast on an invalid chain env" intent, instead of booting and failing every indexer
 * tick against a bad address. */
export function resolveHandlerWalletAddress(chainId: number): Address {
  const config = (addresses as Record<number, { handlerWallet: string }>)[
    chainId
  ];
  if (!config) {
    throw new Error(`No HandlerWallet address configured for chain ${chainId}`);
  }
  if (!isAddress(config.handlerWallet)) {
    throw new Error(
      `Configured HandlerWallet address for chain ${chainId} is not a valid address: ${config.handlerWallet}`,
    );
  }
  return config.handlerWallet;
}
