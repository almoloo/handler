"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CatalogAgentRow } from "@/components/domain/hire/catalog-agent-row";
import { HireSuccess } from "@/components/domain/hire/hire-success";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Slider } from "@/components/ui/slider";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { useAgents } from "@/hooks/use-agents";
import { useCatalog } from "@/hooks/use-catalog";
import { useHireAgent } from "@/hooks/use-hire-agent";
import type { CatalogAgent } from "@/lib/api";
import { deriveCaps, formatDollars } from "@/lib/hire";

const USD8_PER_DOLLAR = BigInt(100_000_000);

const STEPS = ["Agent", "Allowance", "Permissions"];

export default function HireFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<CatalogAgent | null>(null);

  const [dailyCapUsd, setDailyCapUsd] = useState(50);
  const [perTxOverride, setPerTxOverride] = useState<number | null>(null);
  const [cosignOverride, setCosignOverride] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [allowSwaps, setAllowSwaps] = useState(true);
  const [allowUnknownContracts, setAllowUnknownContracts] = useState(false);
  // On -> only VERIFIED counterparties; off -> NEW and above. Never FLAGGED
  // regardless of this toggle — see current-feature.md's load-bearing decision.
  const [verifiedOnly, setVerifiedOnly] = useState(true);

  const derived = deriveCaps(dailyCapUsd);
  // Clamped against the current daily cap / per-tx cap so a lowered daily
  // allowance can't leave a stale override above the slider's own max.
  const perTxCapUsd = Math.min(perTxOverride ?? derived.perTxCapUsd, dailyCapUsd);
  const cosignAboveUsd = Math.min(cosignOverride ?? derived.cosignAboveUsd, perTxCapUsd);

  const { data: hired, isLoading: hiredLoading } = useAgents();
  const { data: catalog, isLoading: catalogLoading, error: catalogError } =
    useCatalog();

  const hiredSessionKeys = useMemo(
    () => new Set((hired ?? []).map((agent) => agent.sessionKey)),
    [hired],
  );
  const hireable = useMemo(
    () => (catalog ?? []).filter((agent) => !hiredSessionKeys.has(agent.address)),
    [catalog, hiredSessionKeys],
  );

  const isLoading = hiredLoading || catalogLoading;

  const { hire, isPending, isSuccess, isReverted, error: hireError } =
    useHireAgent();
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess) return;
    // The indexer only ticks every 3s (see indexer.service.ts's @Interval),
    // but the tx confirms almost immediately on a local chain — a single
    // invalidate right after confirmation can easily race ahead of it and
    // silently miss the new row. Poll a few times instead of once so the
    // list is bound to pick it up without the user needing a manual refresh.
    let cancelled = false;
    let attempt = 0;
    const poll = () => {
      if (cancelled) return;
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
  }, [isSuccess, queryClient]);

  async function handleConfirm() {
    if (!selectedAgent) return;
    setRejectionMessage(null);
    try {
      await hire({
        sessionKey: selectedAgent.address as `0x${string}`,
        dailyCapUsd: BigInt(dailyCapUsd) * USD8_PER_DOLLAR,
        perTxCapUsd: BigInt(perTxCapUsd) * USD8_PER_DOLLAR,
        cosignAboveUsd: BigInt(cosignAboveUsd) * USD8_PER_DOLLAR,
        allowSwaps,
        allowUnknownContracts,
        verifiedOnly,
      });
    } catch (err) {
      // Never surface the raw error: a wrong-signer attempt reverts at
      // simulation with a raw viem/Solidity error (contract addresses, error
      // names) — jargon this app never shows on screen. One generic message
      // covers every revert path, matching the mined-revert banner below.
      console.error("hireAgent failed", err);
      setRejectionMessage(
        "That didn't go through. Check that this is the wallet's owner account and try again.",
      );
    }
  }

  if (isSuccess && selectedAgent) {
    return (
      <main className="flex-1 bg-[var(--surface-page)] font-sans">
        <div className="mx-auto w-full max-w-2xl px-5 py-8">
          <HireSuccess
            agentName={selectedAgent.name}
            onDone={() => router.push("/app")}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Stepper steps={STEPS} current={step} />
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => router.push("/app")}
          >
            Cancel
          </Button>
        </div>

        {step === 0 && (
          <section className="flex flex-col gap-4">
            <h1 className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              Who do you want to hire?
            </h1>

            {isLoading ? (
              <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
                Loading…
              </p>
            ) : catalogError ? (
              <Banner status="error">
                We couldn&apos;t load the agent catalog just now. Refresh to try
                again.
              </Banner>
            ) : hireable.length === 0 ? (
              <EmptyState
                title="No agents left to hire"
                message="You've already hired everyone in the catalog."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {hireable.map((agent) => (
                  <CatalogAgentRow
                    key={agent.agentId}
                    agent={agent}
                    selected={selectedAgent?.agentId === agent.agentId}
                    onSelect={() => setSelectedAgent(agent)}
                  />
                ))}
              </div>
            )}

            <div className="mt-2 flex justify-end">
              <Button
                disabled={!selectedAgent}
                onClick={() => setStep(1)}
              >
                Next
              </Button>
            </div>
          </section>
        )}

        {step === 1 && selectedAgent && (
          <section className="flex flex-col gap-6">
            <h1 className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              Set {selectedAgent.name}&apos;s allowance
            </h1>

            <Slider
              label="Daily allowance"
              value={dailyCapUsd}
              min={10}
              max={500}
              step={5}
              onChange={setDailyCapUsd}
              formatValue={(v) => formatDollars(v)}
            />
            <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
              {selectedAgent.name} can spend up to {formatDollars(dailyCapUsd)}
              /day.
            </p>

            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="self-start text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--interactive-primary)]"
            >
              {advancedOpen ? "Hide advanced" : "Advanced"}
            </button>

            {advancedOpen && (
              <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
                <Slider
                  label="Per-transaction cap"
                  value={perTxCapUsd}
                  min={5}
                  max={dailyCapUsd}
                  step={5}
                  onChange={setPerTxOverride}
                  formatValue={(v) => formatDollars(v)}
                />
                <Slider
                  label="Needs your approval above"
                  value={cosignAboveUsd}
                  min={1}
                  max={perTxCapUsd}
                  step={1}
                  onChange={setCosignOverride}
                  formatValue={(v) => formatDollars(v)}
                />
              </div>
            )}

            <div className="mt-2 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Next</Button>
            </div>
          </section>
        )}

        {step === 2 && selectedAgent && (
          <section className="flex flex-col gap-6">
            <h1 className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
              Set {selectedAgent.name}&apos;s permissions
            </h1>

            <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <Switch
                checked={allowSwaps}
                onChange={setAllowSwaps}
                label="Swaps"
              />
              <Switch
                checked={allowUnknownContracts}
                onChange={setAllowUnknownContracts}
                label="Unknown contracts"
              />
              <Switch
                checked={verifiedOnly}
                onChange={setVerifiedOnly}
                label="Pay other agents: verified only"
              />
            </div>

            {(isReverted || hireError || rejectionMessage) && (
              <Banner status="error">
                {isReverted
                  ? "That didn't go through. Check that this is the wallet's owner account and try again."
                  : rejectionMessage ?? "Something went wrong. Try again."}
              </Banner>
            )}

            <div className="mt-2 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={isPending}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {isPending ? "Confirming…" : "Confirm"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
