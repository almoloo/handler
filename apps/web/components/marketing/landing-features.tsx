interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Guarded spending",
    description:
      "Caps, allowlists, and a human co-sign before anything unusual clears.",
    icon: (
      <>
        <path d="M12 2.5l7.5 3.4v5.4c0 5-3.2 8.6-7.5 10.2-4.3-1.6-7.5-5.2-7.5-10.2V5.9L12 2.5z" />
        <path d="M9 12.2l2.1 2.1 4-4.4" />
      </>
    ),
  },
  {
    title: "Trust-aware policy",
    description:
      "Limits that tighten or relax based on who your agent is paying.",
    icon: (
      <>
        <path d="M4.5 15.5a7.5 7.5 0 1 1 15 0" />
        <path d="M12 15.5l3.6-4.6" />
        <circle cx="12" cy="15.5" r="1" />
      </>
    ),
  },
  {
    title: "Real autonomy",
    description:
      "Agents still act freely — swaps, payments, hiring other agents — inside your rules.",
    icon: <path d="M13 2.5 4.5 14h5.7l-1 7.5 8.5-11.5h-5.7l1-7.5z" />,
  },
];

export function LandingFeatures() {
  return (
    <div className="grid grid-cols-1 gap-6 border-b border-[var(--border-subtle)] px-6 py-8 md:px-16 md:py-12 lg:grid-cols-3 lg:gap-12 lg:py-16">
      {FEATURES.map((feature) => (
        <div key={feature.title} className="flex gap-3.5 lg:block">
          <div className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] lg:mb-4.5 lg:h-11.5 lg:w-11.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--interactive-primary)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lg:h-[22px] lg:w-[22px]"
              aria-hidden="true"
            >
              {feature.icon}
            </svg>
          </div>
          <div>
            <div className="text-[length:var(--text-base)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] lg:mb-2 lg:text-[length:var(--text-lg)]">
              {feature.title}
            </div>
            <div className="mt-0.5 text-[length:var(--text-sm)] leading-[var(--leading-relaxed)] text-[var(--text-secondary)] lg:mt-0 lg:text-[length:var(--text-base)]">
              {feature.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
