"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCatalog } from "@/lib/api";

/** The hireable agent catalog for the hire flow's step 1 picker. */
export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: fetchCatalog,
  });
}
