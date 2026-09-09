import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Director } from "@/components/demo/director";

/**
 * Hidden operator surface (frontend-roadmap §6). Never linked in nav, and
 * `noindex` because "not linked" only stops humans — this is a control panel
 * on a public deployment.
 */
export const metadata: Metadata = {
  title: "Demo director",
  robots: { index: false, follow: false },
};

export default function Demo() {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== "true") {
    notFound();
  }

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-6">
          <h1 className="text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
            Demo director
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            Triggers real agent actions against the showcase wallet. Every beat
            sends a real transaction; reset does not.
          </p>
        </header>
        <Director />
      </div>
    </main>
  );
}
