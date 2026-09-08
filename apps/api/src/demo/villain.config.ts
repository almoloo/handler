import { z } from 'zod';
import { isAddress } from 'viem';
import { hexPrivateKey, positiveWei } from '../common/env-validators.js';

/** A plain `0x` address. "Unverified" isn't something this schema can
 * enforce at parse time — it's an operational fact about the deployed
 * chain (nobody has called `TrustReader.syncAgent()` for it). */
const address = z.string().refine(isAddress, 'must be a valid 0x address');

export const villainEnvSchema = z.object({
  /** The villain's session-key private key. Never persisted — only the
   * derived address and this env var's name (`Agent.keyEnvVar`) are stored. */
  VILLAIN_SESSION_KEY: hexPrivateKey,
  /** Fixed native-ETH payment size (wei) for the villain's run — a payment
   * amount, not a price: the contract's own `PriceConverter` does the real
   * USD valuation on-chain. */
  VILLAIN_PAYMENT_WEI: positiveWei,
  /** The deliberately-unverified counterparty the villain pays. */
  VILLAIN_TARGET_ADDRESS: address,
});

export type VillainEnv = z.infer<typeof villainEnvSchema>;

/** Fail fast on an invalid villain env, per context/coding-standards.md. */
export function parseVillainEnv(
  env: Record<string, string | undefined> = process.env,
): VillainEnv {
  const result = villainEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid villain environment: ${result.error.message}`);
  }
  return result.data;
}
