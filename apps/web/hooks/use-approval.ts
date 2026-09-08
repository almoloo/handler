"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApproval } from "@/lib/api";

/** One pending approval for the approval sheet. Only ever mounted inside
 * `/app`, which already gates on a session — same 401-bounces-to-sign-in
 * pattern as `use-agents`/`use-activity`. A 404 (unknown id, or one
 * belonging to a different wallet) is a real result the sheet renders, not
 * retried. */
export function useApproval(id: string) {
  return useQuery({
    queryKey: ["approval", id],
    queryFn: () => fetchApproval(id),
    // A single-record fetch has no transient-failure upside worth the
    // global default's ~7s of backoff — a 404 here is a real terminal
    // state (unknown id, or one belonging to a different wallet), not a
    // flaky error to retry through.
    retry: false,
  });
}
