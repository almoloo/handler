import { z } from 'zod';

/** A 0x-prefixed 32-byte private key, e.g. a catalog agent's session key. */
export const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte private key');

/** A positive wei amount, coerced from the env string to a `bigint` — a
 * fixed payment size, never a hardcoded price (the contract's own
 * `PriceConverter` does the real USD valuation on-chain). */
export const positiveWei = z
  .string()
  .regex(/^[0-9]+$/, 'must be a non-negative integer (wei)')
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, 'must be greater than 0');
