import { z } from 'zod';

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte private key');

/** A positive wei amount, coerced from the env string to a `bigint`. */
const positiveWei = z
  .string()
  .regex(/^[0-9]+$/, 'must be a non-negative integer (wei)')
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, 'must be greater than 0');

export const agentsEnvSchema = z.object({
  /** Riley's session-key private key. Never persisted — only the derived address and
   * this env var's name (`Agent.keyEnvVar`) are stored. */
  RILEY_SESSION_KEY: hexPrivateKey,
  /** Fixed native-ETH payment size (wei) for Riley's run — a payment amount, not a
   * price: the contract's own `PriceConverter` does the real USD valuation on-chain. */
  RILEY_PAYMENT_WEI: positiveWei,
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
