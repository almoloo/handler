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
