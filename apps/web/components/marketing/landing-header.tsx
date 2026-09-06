import { CtaLink } from "./cta-link";

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4 md:px-16 md:py-5">
      <div className="flex items-center gap-2 md:gap-2.5">
        <div className="h-[22px] w-[22px] flex-shrink-0 rounded-[var(--radius-sm)] bg-[var(--text-primary)] md:h-[26px] md:w-[26px]" />
        <span className="text-[length:var(--text-md)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] md:text-[length:var(--text-lg)]">
          Handler
        </span>
      </div>
      <CtaLink href="/app" size="sm">
        Launch app
      </CtaLink>
    </header>
  );
}
