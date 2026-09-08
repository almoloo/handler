"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TrustIndicator } from "@/components/ui/trust-indicator";
import { useApproval } from "@/hooks/use-approval";
import { useDenyApproval } from "@/hooks/use-deny-approval";
import {
  useLedgerApprove,
  type LedgerApproveStatus,
} from "@/hooks/use-ledger-approve";
import { ApiError, type ApprovalDetail } from "@/lib/api";
import { formatUsd8 } from "@/lib/format";
import { TRUST_LEVEL } from "@/lib/trust";

const RESOLVED_COPY: Record<Exclude<ApprovalDetail["status"], "PENDING">, string> = {
  APPROVED: "This request was already approved.",
  DENIED: "This request was already denied.",
  EXPIRED: "This request expired before it was resolved.",
};

/** No-jargon copy for the Approve button per Ledger co-sign state — the
 * screenshot-ready moment frontend-roadmap.md §4.4 calls for. */
const APPROVE_BUTTON_COPY: Record<LedgerApproveStatus, string> = {
  idle: "Approve",
  connecting: "Connecting to your Ledger…",
  matching: "Checking your Ledger accounts…",
  "awaiting-device-confirmation": "Confirm on your Ledger…",
  broadcasting: "Sending…",
  success: "Approved",
  error: "Approve",
};

export default function ApprovalSheet({
  params,
}: PageProps<"/app/approve/[tx]">) {
  const { tx } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: approval, isLoading, error } = useApproval(tx);
  const {
    deny,
    isPending: isDenying,
    isReverted: denyReverted,
    error: denyError,
  } = useDenyApproval();
  const [denyRejection, setDenyRejection] = useState<string | null>(null);
  const {
    approve,
    status: approveStatus,
    error: approveError,
    txHash: approveTxHash,
  } = useLedgerApprove();

  const approveInFlight = (
    ["connecting", "matching", "awaiting-device-confirmation", "broadcasting"] as LedgerApproveStatus[]
  ).includes(approveStatus);

  async function handleApprove() {
    await approve(tx as `0x${string}`);
  }

  // Once the Ledger-signed approve() lands, refresh the shared caches so
  // Activity/Payroll pick it up — same invalidation Deny does on success.
  useEffect(() => {
    if (approveStatus === "success") {
      queryClient.invalidateQueries({ queryKey: ["approval", tx] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  }, [approveStatus, queryClient, tx]);

  async function handleDeny() {
    setDenyRejection(null);
    try {
      await deny(tx as `0x${string}`);
      queryClient.invalidateQueries({ queryKey: ["approval", tx] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      router.push("/app/activity");
    } catch (err) {
      // Never surface the raw error — same rule the hire flow follows: a
      // wrong-signer attempt reverts at simulation with raw viem/Solidity
      // text (contract addresses, error names), which is jargon this app
      // never shows on screen.
      console.error("deny failed", err);
      setDenyRejection(
        "That didn't go through. Check that this is the wallet's owner account and try again.",
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-page)] font-sans">
        <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
          Loading…
        </p>
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <main className="flex-1 bg-[var(--surface-page)] font-sans">
        <div className="mx-auto w-full max-w-2xl px-5 py-8">
          <Banner status={notFound ? "neutral" : "error"}>
            {notFound
              ? "This request no longer exists or has already been handled."
              : "We couldn't load this request just now. Refresh to try again."}
          </Banner>
        </div>
      </main>
    );
  }

  if (!approval) return null;

  const resolvedCopy =
    approval.status === "PENDING" ? null : RESOLVED_COPY[approval.status];

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-5">
          <h1 className="text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
            Approval needed
          </h1>
        </header>

        {resolvedCopy && (
          <div className="mb-5">
            <Banner status="neutral">{resolvedCopy}</Banner>
          </div>
        )}

        <Card>
          <div className="flex items-center gap-3">
            <Avatar name={approval.agent.name} size={40} src={approval.agent.avatar} />
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--text-base)] font-[var(--weight-medium)] text-[var(--text-primary)]">
                {approval.agent.name}
              </div>
              <TrustIndicator level={TRUST_LEVEL[approval.agent.trustTier]} size="sm" />
            </div>
            <div className="text-[length:var(--text-lg)] font-[var(--weight-semibold)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
              {formatUsd8(approval.amountUsd)}
            </div>
          </div>

          <p className="mt-4 text-[length:var(--text-base)] text-[var(--text-secondary)]">
            {approval.summary}
          </p>

          {(denyReverted || denyError || denyRejection) && (
            <div className="mt-4">
              <Banner status="error">
                {denyReverted
                  ? "That didn't go through. Check that this is the wallet's owner account and try again."
                  : (denyRejection ?? "Something went wrong. Try again.")}
              </Banner>
            </div>
          )}

          {approveStatus === "error" && approveError && (
            <div className="mt-4">
              <Banner status="error">{approveError}</Banner>
            </div>
          )}

          {approveStatus === "success" ? (
            <div className="mt-6">
              <Banner status="approved">
                {approveTxHash
                  ? `Approved — ${approveTxHash.slice(0, 10)}…`
                  : "Approved."}
              </Banner>
            </div>
          ) : (
            approval.status === "PENDING" && (
              <div className="mt-6 flex gap-3">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={isDenying || approveInFlight}
                  onClick={handleDeny}
                >
                  {isDenying ? "Denying…" : "Deny"}
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  disabled={isDenying || approveInFlight}
                  onClick={handleApprove}
                >
                  {APPROVE_BUTTON_COPY[approveStatus]}
                </Button>
              </div>
            )
          )}
        </Card>
      </div>
    </main>
  );
}
