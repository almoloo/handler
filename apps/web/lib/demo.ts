import { ApiError, apiFetch } from "./api";

/**
 * The `/demo` director's API client — operator tooling, isolated by
 * convention (context/coding-standards.md): no product screen may import
 * from this file, and no product component may branch on demo state.
 *
 * Every call here triggers a real action against the showcase wallet through
 * the same code paths any wallet uses. The director controls timing, never
 * results.
 */

/** Mirrors `DemoRun` in apps/api's prisma schema. There is no shared type
 * package between the two apps, so this is hand-kept in sync — same as
 * `PayrollAgent` in `lib/api.ts`. */
export interface DemoRun {
  id: string;
  /** 1–3 for beats, 0 for a reset. */
  beat: number;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  /** Plain-English lines written server-side; render them verbatim. */
  log: string[];
  error: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** The beats the director can trigger, in the order they run in the video. */
export const DEMO_BEATS = [
  { beat: 1, label: "Riley pays the Subcontractor" },
  { beat: 2, label: "Send the villain" },
  { beat: 3, label: "Riley over the co-sign cap" },
] as const;

/** `beat: 0` is how a reset identifies itself in a `DemoRun`. */
export const RESET_BEAT = 0;

export function beatLabel(beat: number): string {
  if (beat === RESET_BEAT) return "Reset the feed";
  return DEMO_BEATS.find((b) => b.beat === beat)?.label ?? `Beat ${beat}`;
}

/** Raised when `apiFetch` swallowed a 401 — the operator's session expired. */
export class DemoNotSignedInError extends Error {
  constructor() {
    super("Session expired");
    this.name = "DemoNotSignedInError";
  }
}

async function postDirector(path: string, token: string): Promise<DemoRun> {
  const run = await apiFetch<DemoRun>(path, {
    method: "POST",
    headers: { "x-demo-token": token },
  });
  // apiFetch returns null for a 401, which is an expected state for the
  // sign-in gate but a real failure here.
  if (!run) {
    throw new DemoNotSignedInError();
  }
  return run;
}

/**
 * Turns any director failure into a sentence the operator can act on
 * mid-take. Anything unrecognised — a dead API, DNS, a dropped connection —
 * lands on the reachability message, which is the likeliest cause when the
 * status code is missing entirely.
 */
export function describeDemoError(error: unknown): string {
  if (error instanceof DemoNotSignedInError) {
    return "Session expired — sign in again at /app.";
  }
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Session expired — sign in again at /app.";
      case 403:
        return "Wrong wallet or wrong token. Check you're signed in as the showcase owner and the token matches DEMO_TOKEN.";
      case 404:
        return "The director is switched off on the API (DEMO_ENABLED).";
      case 409:
        return "Another action is still running — wait for it to finish.";
      case 422:
        return "The showcase owner has no Handler wallet yet — create one in /app first.";
      default:
        return error.message;
    }
  }
  return "Couldn't reach the API — check it's running.";
}

/** Triggers one beat. Sends a real transaction. */
export function triggerBeat(beat: number, token: string): Promise<DemoRun> {
  return postDirector(`/demo/beat/${beat}`, token);
}

/** Clears the showcase wallet's feed. Sends no transaction. */
export function triggerReset(token: string): Promise<DemoRun> {
  return postDirector("/demo/reset", token);
}
