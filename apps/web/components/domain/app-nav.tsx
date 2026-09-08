"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";

const TABS = [
  { label: "Payroll", href: "/app" },
  { label: "Activity", href: "/app/activity" },
] as const;

/**
 * The two-tab bar (Payroll · Activity) + floating "Hire agent" action from
 * frontend-roadmap.md §3 — bottom-fixed below `md` (the mobile pattern the
 * demo video is recorded on), reflowing into a static top bar at `md`+.
 * Same component and instance either way; only the responsive classes
 * change, per §3's "same component, position controlled by breakpoint, not
 * a second nav implementation."
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] md:static md:border-t-0 md:border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-2 md:py-3">
          <div className="flex flex-1 gap-1">
            {TABS.map((tab) => (
              <NavItem
                key={tab.href}
                label={tab.label}
                active={pathname === tab.href}
                onClick={() => router.push(tab.href)}
              />
            ))}
          </div>
          <div className="hidden md:block">
            <Button size="sm" onClick={() => router.push("/app/hire")}>
              Hire agent
            </Button>
          </div>
        </div>
      </nav>
      <button
        type="button"
        onClick={() => router.push("/app/hire")}
        aria-label="Hire agent"
        className="fixed right-5 bottom-20 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-[var(--radius-full)] border-none bg-[var(--interactive-primary)] text-[length:var(--text-xl)] text-[var(--interactive-primary-fg)] shadow-[var(--shadow-lg)] md:hidden"
      >
        +
      </button>
    </>
  );
}
