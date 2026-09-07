import { z } from 'zod';
import { isAddress } from 'viem';

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte private key');

const hexAddress = z.string().refine(isAddress, 'must be an address');

export const agentsEnvSchema = z.object({
  /** Riley's session-key private key. Never persisted — only the derived address and
   * this env var's name (`Agent.keyEnvVar`) are stored. */
  RILEY_SESSION_KEY: hexPrivateKey,
  ONEINCH_API_KEY: z.string().min(1),
  /** Chain id passed to the 1inch Swap API — Base mainnet, which is what the local
   * anvil fork's `BASE_RPC_URL` targets (see context/contracts-roadmap.md §1). This is
   * independent of `CHAIN_ID` (the RPC/DB chain id, `31337` locally). */
  ONEINCH_CHAIN_ID: z.coerce.number().int().positive().default(8453),
  /** Riley's fixed rebalance pair/amount for this feature — a computed strategy is
   * out of scope. Native ETH in wei -> the configured token. */
  RILEY_SWAP_AMOUNT_WEI: z.string().regex(/^[0-9]+$/, 'must be a decimal integer string').default('10000000000000000'),
  /** Base USDC by default. */
  RILEY_SWAP_TOKEN_OUT: hexAddress.default('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
});

export type AgentsEnv = z.infer<typeof agentsEnvSchema>;

/** Fail fast on an invalid agents env, per context/coding-standards.md. */
export function parseAgentsEnv(
  env: Record<string, string | undefined> = process.env,
): AgentsEnv {
  const result = agentsEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid agents environment: ${result.error.message}`);
  }
  return result.data;
}
