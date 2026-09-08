import type { ActivityType } from "@/lib/api";

export type ActivityStatus = "approved" | "pending" | "blocked" | "error";

/**
 * Status color per an activity row's type — frontend-roadmap.md §2's rule:
 * a blocked action is the policy working correctly, so it renders calm
 * slate ("blocked"), never red. Red ("error") is reserved for a genuine
 * failure (FAILED — a submitted tx that reverted or a receipt that never
 * came back), not for an expected/deliberate outcome. FROZEN, DENIED, and
 * EXPIRED are deliberate or lapsed states, not alarms, so they share the
 * same calm slate treatment as BLOCKED.
 * Shared by `activity-card.tsx` and `notification-toast-layer.tsx` so the
 * two surfaces never drift on what counts as "blocked" vs "error".
 */
const STATUS_BY_TYPE: Record<ActivityType, ActivityStatus> = {
  WALLET_CREATED: "approved",
  HIRED: "approved",
  POLICY_UPDATED: "approved",
  UNFROZEN: "approved",
  SWAP: "approved",
  AGENT_PAYMENT: "approved",
  TRANSFER: "approved",
  CONTRACT_CALL: "approved",
  APPROVED: "approved",
  FROZEN: "blocked",
  DENIED: "blocked",
  EXPIRED: "blocked",
  BLOCKED: "blocked",
  PENDING: "pending",
  FAILED: "error",
};

export function activityStatus(type: ActivityType): ActivityStatus {
  return STATUS_BY_TYPE[type];
}
