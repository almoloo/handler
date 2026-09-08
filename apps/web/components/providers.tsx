"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { sessionQueryKey } from "@/hooks/use-session";
import { isUnauthorized } from "@/lib/api";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    // A 401 from any /app read means the session expired mid-use. Dropping the
    // cached session sends the /app layout back to its sign-in gate, per
    // frontend-roadmap.md §5 — handled once here so every screen inherits it.
    const queryCache = new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) {
          client.invalidateQueries({ queryKey: sessionQueryKey });
        }
      },
    });
    const client = new QueryClient({
      queryCache,
      defaultOptions: {
        queries: {
          // An expired session is terminal — retrying only delays the bounce.
          retry: (failureCount, error) =>
            !isUnauthorized(error) && failureCount < 3,
        },
      },
    });
    return client;
  });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
