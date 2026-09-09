import { z } from 'zod';
import { isAddress } from 'viem';
import { positiveWei } from '../common/env-validators.js';

/** A plain `0x` address. */
const address = z.string().refine(isAddress, 'must be a valid 0x address');

/**
 * The demo director's own vars. Unlike `villain.config.ts`, these are only
 * required when the director is switched on: a deployment with
 * `DEMO_ENABLED` unset must boot with none of them set (the operator tooling
 * simply 404s), so the schema is parsed in two stages rather than one.
 */
const enabledSchema = z.object({
  /** Shared secret the director sends as `x-demo-token`. Long enough that a
   * guessed value isn't a realistic path to triggering real payments. */
  DEMO_TOKEN: z.string().min(16, 'must be at least 16 characters'),
  /** The showcase wallet's **owner** EOA. The showcase `HandlerWallet` itself
   * is resolved from this at run time, so there is no second address to keep
   * in sync when the owner re-creates their wallet. */
  DEMO_OWNER_ADDRESS: address,
  /** Fixed native-ETH payment size (wei) for the over-the-co-sign-cap beat —
   * a payment amount, not a price: `PriceConverter` does the real USD
   * valuation on-chain, and the wallet's own `cosignAboveUsd` decides whether
   * this crosses the threshold. Must be large enough that it does. */
  DEMO_COSIGN_PAYMENT_WEI: positiveWei,
});

/** The director switched off — the only shape a deployment without demo vars
 * can produce, and the one `DemoGuard` turns into a 404. */
type DemoDisabled = { enabled: false };

/** The director switched on, with every var it needs validated. Exported for
 * `DemoService.enabledEnv`, its single narrowing point. */
export type DemoEnabled = { enabled: true } & z.infer<typeof enabledSchema>;

export type DemoEnv = DemoDisabled | DemoEnabled;

/** Fail fast on an invalid demo env, per context/coding-standards.md — but
 * only once `DEMO_ENABLED=true` has opted in. Any other value (unset,
 * `false`, anything else) is "off", never an error. */
export function parseDemoEnv(
  env: Record<string, string | undefined> = process.env,
): DemoEnv {
  if (env.DEMO_ENABLED !== 'true') {
    return { enabled: false };
  }

  const result = enabledSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid demo environment: ${result.error.message}`);
  }
  return { enabled: true, ...result.data };
}
