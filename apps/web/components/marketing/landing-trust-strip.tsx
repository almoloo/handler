const PARTNERS = ["Chainlink", "Ledger", "1inch"];

export function LandingTrustStrip() {
  return (
    <div className="flex flex-col items-center gap-3.5 border-b border-[var(--border-subtle)] px-6 py-6.5 text-center md:flex-row md:justify-center md:gap-7 md:py-9">
      <div className="text-[length:var(--text-2xs)] font-[var(--weight-semibold)] tracking-[var(--tracking-wider)] text-[var(--text-tertiary)] uppercase">
        Built with
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4.5 text-[length:var(--text-sm)] font-[var(--weight-semibold)] text-[var(--text-secondary)] md:gap-5.5 md:text-[length:var(--text-base)]">
        {PARTNERS.map((partner, i) => (
          <span key={partner} className="flex items-center gap-4.5 md:gap-5.5">
            {i > 0 && <span className="text-[var(--border-default)]">·</span>}
            {partner}
          </span>
        ))}
      </div>
    </div>
  );
}
