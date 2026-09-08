"use client";

import { useRouter } from "next/navigation";
import { PayrollAgentRow } from "@/components/domain/payroll-agent-row";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAgents } from "@/hooks/use-agents";
import type { PayrollAgent } from "@/lib/api";
import { formatUsd8 } from "@/lib/format";

/** Total daily spending capacity the owner has granted across every agent —
 * summed as USD-8 integers, formatted once at render. */
function totalUnderManagement(agents: PayrollAgent[]): string {
  const total = agents.reduce(
    (sum, agent) => sum + BigInt(agent.dailyCapUsd),
    BigInt(0),
  );
  return formatUsd8(total.toString());
}

export default function Payroll() {
  const router = useRouter();
  const { data: agents, isLoading, error } = useAgents();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-page)] font-sans">
        <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-7">
          <h1 className="text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-tertiary)]">
            Total under management
          </h1>
          <p className="mt-1 text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
            {agents ? totalUnderManagement(agents) : "—"}
          </p>
          <p className="mt-1.5 text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            Every payment is checked against your rules before it leaves.
          </p>
        </header>

        {error ? (
          <Banner status="error">
            We couldn&apos;t load your payroll just now. Refresh to try again.
          </Banner>
        ) : agents && agents.length > 0 ? (
          <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-1 shadow-[var(--shadow-sm)]">
            {agents.map((agent) => (
              <PayrollAgentRow key={agent.policyId} agent={agent} />
            ))}
          </section>
        ) : (
          <EmptyState
            title="No agents on payroll yet"
            message="Hire your first one and set the rules it has to follow."
            action={
              <Button onClick={() => router.push("/hire")}>
                Hire your first
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}
