"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActivityItem } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Subscribes to the backend's realtime activity stream (`GET
 * /events/stream`) for the lifetime of the mounted component, invalidating
 * the shared `["activity"]` query cache on every new row so any currently
 * mounted `use-activity` query (on `/app/activity`, wherever it's rendered)
 * refetches near-instantly instead of waiting for its polling backstop.
 * `onItem`, if given, also receives the parsed row itself — used by the
 * notification-toast layer to render its content, not just trigger a
 * refetch.
 *
 * The browser's native `EventSource` already resends `Last-Event-ID` on its
 * own reconnect after a dropped connection, which is exactly the
 * resume-cursor contract `GET /events/stream` documents server-side — no
 * manual cursor tracking is needed here.
 */
export function useActivityStream(
  onItem?: (item: ActivityItem) => void,
  enabled = true,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!API_BASE_URL || !enabled) return;
    const source = new EventSource(`${API_BASE_URL}/events/stream`, {
      withCredentials: true,
    });
    source.onmessage = (event: MessageEvent<string>) => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      if (onItem) {
        const item = JSON.parse(event.data) as ActivityItem;
        onItem(item);
      }
    };
    return () => source.close();
  }, [queryClient, onItem, enabled]);
}
