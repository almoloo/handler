"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgentFile } from "@/lib/api";

/**
 * One agent's file for the signed-in wallet. Only ever mounted inside `/app`,
 * which already gates on a session, so a 401 here means the session expired
 * mid-use — `Providers` turns that into a bounce back to the sign-in gate.
 * A 404 (unknown agent id) surfaces as a real error for the page to render
 * as "this agent doesn't exist," same as the approval sheet's 404 handling.
 */
export function useAgentFile(agentId: string) {
  return useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => fetchAgentFile(agentId),
    retry: false,
  });
}
