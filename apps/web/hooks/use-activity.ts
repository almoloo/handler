"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchActivity, type ActivityFilter } from "@/lib/api";

/** Backstop per backend-roadmap.md §7's cut order ("SSE → frontend falls
 * back to polling"): even with `use-activity-stream`'s SSE connection live,
 * this keeps refetching on an interval so a stalled/blocked SSE connection
 * degrades to polling instead of a dead screen. */
const POLL_INTERVAL_MS = 5_000;

export const activityQueryKey = (filter: ActivityFilter) =>
  ["activity", filter] as const;

/**
 * The signed-in wallet's activity feed, paginated on `nextCursor`. Only ever
 * mounted inside `/app`, which already gates on a session, so a 401 here
 * means the session expired mid-use — `Providers` turns that into a bounce
 * back to the sign-in gate (same pattern as `use-agents`).
 */
export function useActivity(filter: ActivityFilter) {
  return useInfiniteQuery({
    queryKey: activityQueryKey(filter),
    queryFn: ({ pageParam }) =>
      fetchActivity({ filter, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: POLL_INTERVAL_MS,
  });
}
