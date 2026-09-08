import { ListRow } from "@/components/ui/list-row";
import type { ActivityItem } from "@/lib/api";
import { activityStatus } from "@/lib/activity";
import { formatRelativeTime, formatUsd8 } from "@/lib/format";

export function ActivityCard({ item }: { item: ActivityItem }) {
  const avatarName = item.agent?.name ?? item.counterparty?.name ?? "Handler";
  return (
    <ListRow
      avatarName={avatarName}
      title={item.summary}
      amount={item.amountUsd ? formatUsd8(item.amountUsd) : undefined}
      status={activityStatus(item.type)}
      time={formatRelativeTime(item.createdAt)}
    />
  );
}
