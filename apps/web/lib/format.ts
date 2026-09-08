/**
 * USD-8 fixed-point helpers. Every USD value crossing the contract → API → UI
 * boundary is an 8-decimal integer (Chainlink's AggregatorV3 convention), so
 * it arrives here as a decimal string and stays integral until render — never
 * parseFloat. Mirrors apps/api/src/common/format.ts's cents math.
 */

/** USD-8 → whole cents. Safe as a `number`: cents stay well inside 2^53.
 * `BigInt(...)` rather than a `1_000_000n` literal — this app targets ES2017. */
export function usd8ToCents(usd8: string): number {
  return Number(BigInt(usd8) / BigInt(1_000_000));
}

/** Whole cents → "$1,234.56". Chain USD values are unsigned, so no negative
 * case is handled here. */
export function formatCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const remainder = (cents % 100).toString().padStart(2, "0");
  return `$${dollars.toLocaleString("en-US")}.${remainder}`;
}

/** USD-8 decimal string → "$1,234.56". */
export function formatUsd8(usd8: string): string {
  return formatCents(usd8ToCents(usd8));
}

/** An ISO timestamp → a short relative label ("just now", "5m", "3h", "2d"),
 * falling back to a locale date once it's more than a week old. */
export function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaMinutes = Math.floor(deltaMs / 60_000);
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
