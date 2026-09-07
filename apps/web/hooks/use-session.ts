"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "@/lib/api";

export const sessionQueryKey = ["session"] as const;

/** The session cookie is the sole source of truth for auth — a 401 resolves
 * to `null` (signed out), never a thrown query error. */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: Infinity,
    retry: false,
  });
}
