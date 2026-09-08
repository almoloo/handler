"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Toast } from "@/components/ui/toast";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { useUiStore } from "@/hooks/use-ui-store";
import type { ActivityItem } from "@/lib/api";
import { activityStatus } from "@/lib/activity";

/**
 * Cross-screen notification-card layer (frontend-roadmap.md §4.6): mounted
 * once in `app/app/layout.tsx`, subscribes to the same realtime activity
 * stream `use-activity-stream.ts` (step 6) already invalidates the shared
 * query cache with, and renders each new row as a slide-in `Toast` — the
 * first of the two orchestrated motion moments in §2. Tapping a pending
 * toast deep-links to `/app/approve/[tx]`, the real approval sheet. Each
 * toast schedules its own auto-dismiss in `use-ui-store.ts` at push time, so
 * one toast's countdown is never reset by another arriving or leaving.
 */
export function NotificationToastLayer() {
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useUiStore();

  const onItem = useCallback(
    (item: ActivityItem) => {
      pushToast({
        status: activityStatus(item.type),
        title: item.summary,
        pendingApprovalId: item.pendingApprovalId ?? undefined,
      });
    },
    [pushToast],
  );

  useActivityStream(onItem);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto"
            onClick={() => {
              dismissToast(toast.id);
              if (toast.status === "pending" && toast.pendingApprovalId) {
                router.push(`/app/approve/${toast.pendingApprovalId}`);
              }
            }}
          >
            <Toast
              status={toast.status}
              title={toast.title}
              onClose={() => dismissToast(toast.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
