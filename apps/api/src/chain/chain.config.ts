import { z } from 'zod';
import { addresses } from '@handler/contracts/addresses';
import type { Address } from 'viem';

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

/** Looks up the configured HandlerWallet address for a chain id, per @handler/contracts/addresses. */
export function resolveHandlerWalletAddress(chainId: number): Address {
  const config = (addresses as Record<number, { handlerWallet: string }>)[
    chainId
  ];
  if (!config) {
    throw new Error(`No HandlerWallet address configured for chain ${chainId}`);
  }
  return config.handlerWallet as Address;
}
