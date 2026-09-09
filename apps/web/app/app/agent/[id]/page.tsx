"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AgentActivityRow } from "@/components/domain/agent-activity-row";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TrustIndicator } from "@/components/ui/trust-indicator";
import { useAgentFile } from "@/hooks/use-agent-file";
import { useFreezeAgent } from "@/hooks/use-freeze-agent";
import { useWalletAddress } from "@/hooks/use-wallet-address";
import { ApiError } from "@/lib/api";
import { formatCents, usd8ToCents } from "@/lib/format";
import { TRUST_LEVEL } from "@/lib/trust";

export default function AgentFile({ params }: PageProps<"/app/agent/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: agent, isLoading, error } = useAgentFile(id);
  const {
    setFrozen,
    isPending: isFreezePending,
    isSuccess: freezeSucceeded,
    isReverted: freezeReverted,
    error: freezeError,
  } = useFreezeAgent();
  // Freeze/unfreeze target this owner's own HandlerWallet (see
  // use-freeze-agent.ts) — a click racing ahead of this on-chain walletOf
  // read would otherwise no-op or throw, same race every other write hook
  // in this app already guards against.
  const { walletAddress, isLoading: isWalletLoading } = useWalletAddress();
  const [freezeRejection, setFreezeRejection] = useState<string | null>(null);

  useEffect(() => {
    if (!freezeSucceeded) return;
    // Same bounded-poll pattern as the hire flow's post-tx refresh: the
    // indexer ticks every 3s, so a single invalidate right after
    // confirmation can race ahead of it and still show the stale frozen
    // state.
    let cancelled = false;
    let attempt = 0;
    const poll = () => {
      if (cancelled) return;
      queryClient.refetchQueries({ queryKey: ["agent", id] });
      queryClient.refetchQueries({ queryKey: ["agents"] });
      attempt += 1;
      if (attempt < 5) {
        setTimeout(poll, 1500);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [freezeSucceeded, queryClient, id]);

  async function handleToggleFreeze() {
    if (!agent?.policy) return;
    setFreezeRejection(null);
    try {
      await setFrozen(
        agent.policy.sessionKey as `0x${string}`,
        !agent.policy.frozen,
      );
    } catch (err) {
      // Never surface the raw error — same rule the hire/deny flows follow:
      // a wrong-signer attempt reverts at simulation with raw viem/Solidity
      // text, which is jargon this app never shows on screen.
      console.error("freeze toggle failed", err);
      setFreezeRejection(
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
              ? "This agent doesn't exist."
              : "We couldn't load this agent just now. Refresh to try again."}
          </Banner>
        </div>
      </main>
    );
  }

  if (!agent) return null;

  const spentCents = agent.policy ? usd8ToCents(agent.policy.spentTodayUsd) : 0;
  const capCents = agent.policy ? usd8ToCents(agent.policy.dailyCapUsd) : 0;

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-5 flex items-center gap-3">
          <Avatar name={agent.name} size={48} src={agent.avatar} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              {agent.name}
            </h1>
            <TrustIndicator level={TRUST_LEVEL[agent.trustTier]} size="sm" />
          </div>
        </header>

        <Card>
          <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            {agent.trustSummary}
          </p>
          {agent.description && (
            <p className="mt-2 text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
              {agent.description}
            </p>
          )}
        </Card>

        {agent.policy ? (
          <section className="mt-5">
            <Card title="Policy">
              {agent.policy.frozen && (
                <div className="mb-4">
                  <Banner status="blocked">
                    This agent is frozen — it can&apos;t spend until you
                    unfreeze it.
                  </Banner>
                </div>
              )}
              <ul className="flex flex-col gap-1.5">
                {agent.policy.policySentences.map((sentence, index) => (
                  <li
                    key={index}
                    className="text-[length:var(--text-base)] text-[var(--text-secondary)]"
                  >
                    {sentence}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <ProgressBar
                  value={spentCents}
                  max={capCents > 0 ? capCents : 1}
                  label="Spent today"
                  formatValue={(spent) =>
                    `${formatCents(spent)} of ${formatCents(capCents)}`
                  }
                />
              </div>

              {(freezeReverted || freezeError || freezeRejection) && (
                <div className="mt-4">
                  <Banner status="error">
                    {freezeReverted
                      ? "That didn't go through. Check that this is the wallet's owner account and try again."
                      : (freezeRejection ?? "Something went wrong. Try again.")}
                  </Banner>
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={isFreezePending || isWalletLoading || !walletAddress}
                  onClick={handleToggleFreeze}
                >
                  {isFreezePending
                    ? "Sending…"
                    : agent.policy.frozen
                      ? "Unfreeze"
                      : "Freeze"}
                </Button>
              </div>
            </Card>

            <h2 className="mt-5 mb-2 text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-tertiary)]">
              Recent activity
            </h2>
            {agent.recentActivity.length > 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-1 shadow-[var(--shadow-sm)]">
                {agent.recentActivity.map((item) => (
                  <AgentActivityRow
                    key={item.id}
                    item={item}
                    agentName={agent.name}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
                No activity yet.
              </p>
            )}
          </section>
        ) : (
          <div className="mt-5">
            <Card>
              <p className="mb-3 text-[length:var(--text-base)] text-[var(--text-secondary)]">
                You haven&apos;t hired this agent yet.
              </p>
              <Button onClick={() => router.push("/app/hire")}>
                Hire this agent
              </Button>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
