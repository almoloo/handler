import { z } from 'zod';

export const activityEnvSchema = z.object({
  /** Polling interval for GET /events/stream's tick — no queue/pubsub infra
   * in this codebase, so "real-time" means "polled on a short interval". */
  ACTIVITY_SSE_POLL_MS: z.coerce.number().int().positive().default(2000),
});

export type ActivityEnv = z.infer<typeof activityEnvSchema>;

/** Fail fast on an invalid activity env, per context/coding-standards.md. */
export function parseActivityEnv(
  env: Record<string, string | undefined> = process.env,
): ActivityEnv {
  const result = activityEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid activity environment: ${result.error.message}`);
  }
  return result.data;
}
