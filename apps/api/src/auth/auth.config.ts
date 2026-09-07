import { z } from 'zod';

export const authEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  SIWE_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  /** RFC 4501 domain the SIWE message must have been signed for — rejects a message
   * signed for another site that happens to carry one of our nonces. */
  SIWE_DOMAIN: z.string().min(1).default('localhost:3000'),
  /** Chain id the SIWE message must declare, checked against the parsed message
   * (siwe.verify() itself has no chainId param) before the signature is verified. */
  SIWE_CHAIN_ID: z.coerce.number().int().positive().default(31337),
  /** Origin allowed to make cookied cross-origin requests (the web app) — CORS
   * must echo this exact origin, not "*", for credentialed requests to work. */
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Fail fast on an invalid auth env, per context/coding-standards.md. */
export function parseAuthEnv(
  env: Record<string, string | undefined> = process.env,
): AuthEnv {
  const result = authEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid auth environment: ${result.error.message}`);
  }
  return result.data;
}
