/** Truncated address for on-screen display, per the project's no-jargon copy rule. */
export function truncateAddress(address: string): string {
  const lower = address.toLowerCase();
  return `${lower.slice(0, 6)}…${lower.slice(-4)}`;
}

/** Formats an 8-decimal fixed-point USD bigint as a "$1,234.56" string, integer math only. */
export function formatUsd(usd8: bigint): string {
  const cents = usd8 / 1_000_000n;
  const dollars = cents / 100n;
  const remainder = (cents % 100n).toString().padStart(2, '0');
  return `$${dollars.toLocaleString('en-US')}.${remainder}`;
}
