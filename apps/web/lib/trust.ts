import type { TrustIndicatorProps } from "@/components/ui/trust-indicator";
import type { TrustTier } from "@/lib/api";

/** FLAGGED has no distinct visual tier yet, so it renders as the most
 * restrictive one rather than borrowing the "building trust" middle state. */
export const TRUST_LEVEL: Record<
  TrustTier,
  NonNullable<TrustIndicatorProps["level"]>
> = {
  VERIFIED: "established",
  NEW: "new",
  FLAGGED: "new",
};
