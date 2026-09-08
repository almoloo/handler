/**
 * Whole-dollar allowance math for the hire flow's step 2. Operates purely in
 * whole dollars — conversion to USD-8 integer strings happens only at submit
 * time (`lib/format.ts`'s `usd8ToCents` inverse), never stored in form state.
 */
export interface DerivedCaps {
  perTxCapUsd: number;
  cosignAboveUsd: number;
}

/** Per-tx cap defaults to half the daily cap (never above it, never below
 * $10) so a single transaction can't spend the whole day's allowance by
 * default. Co-sign kicks in at half of that, so there's a real band between
 * "auto-approves" and "needs the owner" to demo. */
export function deriveCaps(dailyCapUsd: number): DerivedCaps {
  const perTxCapUsd = Math.round(Math.min(dailyCapUsd, Math.max(10, dailyCapUsd * 0.5)));
  const cosignAboveUsd = Math.round(Math.max(5, perTxCapUsd * 0.5));
  return { perTxCapUsd, cosignAboveUsd };
}

export function formatDollars(usd: number): string {
  return `$${usd.toLocaleString("en-US")}`;
}
