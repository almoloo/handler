const STEPS = [
  {
    number: "01",
    title: "Hire an agent",
    description:
      "Bring any agent onto Handler and give it a name your team recognizes.",
  },
  {
    number: "02",
    title: "Set its allowance and rules",
    description:
      "Daily caps, allowed counterparties, and when a co-sign is required.",
  },
  {
    number: "03",
    title: "Handler enforces it automatically",
    description:
      "Every action is checked against the policy before it clears — no exceptions.",
  },
];

export function LandingHowItWorks() {
  return (
    <div className="border-b border-[var(--border-subtle)] px-6 py-8 md:px-16 md:py-10 lg:py-14">
      <div className="mb-5 text-[length:var(--text-2xs)] font-[var(--weight-semibold)] tracking-[var(--tracking-wider)] text-[var(--text-tertiary)] uppercase md:mb-8 md:text-[length:var(--text-xs)]">
        How it works
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:gap-10">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="flex gap-3.5 lg:block lg:border-t-2 lg:border-[var(--interactive-primary)] lg:pt-4"
          >
            <div className="w-5.5 flex-shrink-0 text-[length:var(--text-sm)] font-[var(--weight-bold)] text-[var(--interactive-primary)] lg:mb-2.5 lg:w-auto">
              {step.number}
            </div>
            <div>
              <div className="text-[length:var(--text-base)] font-[var(--weight-semibold)] lg:mb-2 lg:text-[length:var(--text-lg)]">
                {step.title}
              </div>
              <div className="mt-0.5 text-[length:var(--text-sm)] leading-[var(--leading-relaxed)] text-[var(--text-secondary)] lg:mt-0 lg:text-[length:var(--text-base)]">
                {step.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
