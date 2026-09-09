"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { beatLabel, RESET_BEAT, type DemoRun } from "@/lib/demo";

/**
 * `status` is what says whether an action worked — both routes answer 201 for
 * a SUCCEEDED and a FAILED run, so the HTTP code never does.
 *
 * FAILED gets the error treatment rather than the calm slate the app uses for
 * blocked payments: a blocked villain is a *successful* run whose on-chain
 * outcome was a block, and it arrives here as SUCCEEDED. A FAILED run means
 * the action never happened — the villain isn't hired, the RPC is down, the
 * wallet is out of ETH — which is a genuine failure the operator must fix
 * before recording.
 */
const STATUS_BADGE = {
  SUCCEEDED: { status: "approved" as const, label: "Ran" },
  FAILED: { status: "error" as const, label: "Failed" },
  RUNNING: { status: "pending" as const, label: "Running" },
};

export function RunList({ runs }: { runs: DemoRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
        Nothing triggered yet this session.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => {
        const badge = STATUS_BADGE[run.status];
        return (
          <Card key={run.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[length:var(--text-md)] font-[var(--weight-medium)] text-[var(--text-primary)]">
                {beatLabel(run.beat)}
              </span>
              <Badge status={badge.status}>{badge.label}</Badge>
            </div>

            <ul className="mt-3 flex flex-col gap-1">
              {run.log.map((line, index) => (
                <li
                  key={`${run.id}-${index}`}
                  className="text-[length:var(--text-sm)] text-[var(--text-secondary)]"
                >
                  {line}
                </li>
              ))}
            </ul>

            {run.error && (
              <p className="mt-2 text-[length:var(--text-sm)] text-[var(--status-error-fg)]">
                {run.error}
              </p>
            )}

            {run.beat === RESET_BEAT && run.status === "SUCCEEDED" && (
              <p className="mt-3 text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
                The hero phone still shows the old cards until its browser
                regains focus — switch away and back to refresh it.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
