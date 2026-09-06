import { CtaLink } from "./cta-link";
import { NotificationCardMock } from "./notification-card-mock";

export function LandingHero() {
  return (
    <div className="border-b border-[var(--border-subtle)] px-6 py-9 md:px-16 md:py-14 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-22">
      <div>
        <h1 className="m-0 mb-3.5 max-w-[12ch] text-[length:var(--text-display-sm)] font-[var(--weight-extrabold)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] md:mb-5 md:text-[length:var(--text-display-md)] lg:text-[length:var(--text-display-lg)]">
          The banking app for your AI.
        </h1>
        <p className="m-0 mb-5.5 max-w-[44ch] text-[length:var(--text-base)] leading-[var(--leading-relaxed)] text-[var(--text-secondary)] md:mb-7.5 md:text-[length:var(--text-md)]">
          Agents are getting real spending power. Most wallets only offer
          static limits. Handler&rsquo;s limits know who they&rsquo;re
          dealing with.
        </p>
        <CtaLink href="/app" size="lg">
          Launch app
        </CtaLink>
      </div>

      <div className="relative mt-7.5 px-1 md:mt-9 md:px-5 lg:mt-0">
        <NotificationCardMock
          variant="approved"
          title="Approved · $180 payment"
          subtitle="Within daily allowance"
          className="max-w-[320px] -rotate-2"
        />
        <NotificationCardMock
          variant="blocked"
          title="Blocked by policy"
          subtitle="Not on the allowlist"
          className="relative z-10 -mt-2 ml-5.5 max-w-[320px] rotate-2 md:-mt-3.5 md:ml-15"
        />
      </div>
    </div>
  );
}
