import { Avatar } from "@/components/ui/avatar";
import { TrustIndicator } from "@/components/ui/trust-indicator";
import type { CatalogAgent } from "@/lib/api";
import { TRUST_LEVEL } from "@/lib/trust";

export function CatalogAgentRow({
  agent,
  selected,
  onSelect,
}: {
  agent: CatalogAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-3 text-left font-sans transition-colors duration-[var(--duration-fast)] ${
        selected
          ? "border-[var(--interactive-primary)] bg-[var(--surface-sunken)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      <Avatar name={agent.name} size={40} src={agent.avatar} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-base)] font-[var(--weight-medium)] text-[var(--text-primary)]">
          {agent.name}
        </div>
        {agent.description && (
          <div className="truncate text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
            {agent.description}
          </div>
        )}
        <div className="mt-1">
          <TrustIndicator level={TRUST_LEVEL[agent.trustTier]} size="sm" />
        </div>
      </div>
      <span
        className={`h-5 w-5 shrink-0 rounded-full border-2 ${
          selected
            ? "border-[var(--interactive-primary)] bg-[var(--interactive-primary)]"
            : "border-[var(--border-default)]"
        }`}
      />
    </button>
  );
}
