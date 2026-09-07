import { z } from 'zod';

export const authEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  SIWE_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(5 * 60),
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
