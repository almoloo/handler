import Link from "next/link";

export function LandingFooter() {
  return (
    <div className="flex flex-col items-start gap-2 px-6 py-5.5 md:flex-row md:items-center md:justify-between md:px-16 md:py-7">
      <div className="flex items-center gap-1.75">
        <div className="h-4 w-4 rounded-[var(--radius-xs)] bg-[var(--text-primary)] md:h-4.5 md:w-4.5" />
        <span className="text-[length:var(--text-sm)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] md:text-[length:var(--text-base)]">
          Handler
        </span>
      </div>
      <div className="text-[length:var(--text-xs)] text-[var(--text-tertiary)] md:text-[length:var(--text-sm)]">
        An ETHGlobal ETHOnline 2026 project
      </div>
      <Link
        href="/app"
        className="text-[length:var(--text-xs)] font-[var(--weight-semibold)] text-[var(--interactive-primary)] md:text-[length:var(--text-sm)]"
      >
        Open app →
      </Link>
    </div>
  );
}
