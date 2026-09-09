import { ListRow } from "@/components/ui/list-row";
import type { AgentFile } from "@/lib/api";
import { activityStatus } from "@/lib/activity";
import { formatRelativeTime, formatUsd8 } from "@/lib/format";

/**
 * One row of an agent file's `recentActivity` — a reduced shape (no
 * `agent`/`counterparty`/`blockReason`) compared to the full `ActivityItem`
 * `activity-card.tsx` renders, since every row here already belongs to the
 * one agent this page is scoped to.
 */
export function AgentActivityRow({
  item,
  agentName,
}: {
  item: AgentFile["recentActivity"][number];
  agentName: string;
}) {
  return (
    <ListRow
      avatarName={agentName}
      title={item.summary}
      amount={item.amountUsd ? formatUsd8(item.amountUsd) : undefined}
      status={activityStatus(item.type)}
      time={formatRelativeTime(item.createdAt)}
    />
  );
}
