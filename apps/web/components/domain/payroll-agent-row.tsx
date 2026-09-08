import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TrustIndicator, type TrustIndicatorProps } from "@/components/ui/trust-indicator";
import type { PayrollAgent, TrustTier } from "@/lib/api";
import { formatCents, usd8ToCents } from "@/lib/format";

type AgentStatus = "active" | "frozen" | "pending";

const STATUS_STYLE: Record<AgentStatus, { label: string; dotClass: string }> = {
  active: { label: "Active", dotClass: "bg-[var(--status-approved-icon)]" },
  pending: { label: "Needs your approval", dotClass: "bg-[var(--status-pending-icon)]" },
  frozen: { label: "Frozen", dotClass: "bg-[var(--status-blocked-icon)]" },
};

/** FLAGGED has no distinct visual tier yet, so it renders as the most
 * restrictive one rather than borrowing the "building trust" middle state. */
const TRUST_LEVEL: Record<TrustTier, NonNullable<TrustIndicatorProps["level"]>> = {
  VERIFIED: "established",
  NEW: "new",
  FLAGGED: "new",
};

function statusOf(agent: PayrollAgent): AgentStatus {
  if (agent.frozen) return "frozen";
  if (agent.pendingApprovalCount > 0) return "pending";
  return "active";
}

export function PayrollAgentRow({ agent }: { agent: PayrollAgent }) {
  const status = statusOf(agent);
  const { label, dotClass } = STATUS_STYLE[status];
  const spentCents = usd8ToCents(agent.spentTodayUsd);
  const capCents = usd8ToCents(agent.dailyCapUsd);

  return (
    <div className="flex items-center gap-4 border-b border-[var(--border-subtle)] px-1 py-4 font-sans last:border-b-0">
      <Avatar name={agent.name} size={40} src={agent.avatar} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[length:var(--text-base)] font-[var(--weight-medium)] text-[var(--text-primary)]">
            {agent.name}
          </span>
          <span className={`h-2 w-2 shrink-0 rounded-[var(--radius-full)] ${dotClass}`} />
          <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            {label}
          </span>
        </div>

        <div className="mt-0.5">
          <TrustIndicator level={TRUST_LEVEL[agent.trustTier]} size="sm" />
        </div>

        <div className="mt-2.5">
          {/* `max` is geometry only: a zero daily cap is a real on-chain state
              (hireAgent does not reject one) and would divide to NaN, so the
              track falls back to an empty bar while the label prints the true
              cap. */}
          <ProgressBar
            value={spentCents}
            max={capCents > 0 ? capCents : 1}
            label="Spent today"
            formatValue={(spent) =>
              `${formatCents(spent)} of ${formatCents(capCents)}`
            }
          />
        </div>
      </div>
    </div>
  );
}
