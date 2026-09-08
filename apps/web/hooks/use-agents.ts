"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgents } from "@/lib/api";

/**
 * The payroll list for the signed-in wallet. Only ever mounted inside `/app`,
 * which already gates on a session, so a 401 here means the session expired
 * mid-use — `Providers` turns that into a bounce back to the sign-in gate.
 */
export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
  });
}
