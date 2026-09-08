"use client";

import { useState } from "react";
import { ActivityCard } from "@/components/domain/activity-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, type FilterChipOption } from "@/components/ui/filter-chips";
import { useActivity } from "@/hooks/use-activity";
import type { ActivityFilter } from "@/lib/api";

const FILTERS: FilterChipOption[] = [
  { label: "All", value: "all" },
  { label: "Blocked", value: "blocked", status: "blocked" },
  { label: "Pending", value: "pending", status: "pending" },
];

export default function Activity() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useActivity(filter);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="flex-1 bg-[var(--surface-page)] font-sans">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-5">
          <h1 className="text-[length:var(--text-xl)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
            Activity
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            Every payment your agents have tried, approved or blocked.
          </p>
        </header>

        <div className="mb-5">
          <FilterChips
            options={FILTERS}
            value={filter}
            onChange={(value) => setFilter(value as ActivityFilter)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
            Loading…
          </p>
        ) : error ? (
          <Banner status="error">
            We couldn&apos;t load activity just now. Refresh to try again.
          </Banner>
        ) : items.length > 0 ? (
          <>
            <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-1 shadow-[var(--shadow-sm)]">
              {items.map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </section>
            {hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="No activity yet"
            message={
              filter === "all"
                ? "Once your agents start spending, every payment shows up here."
                : "Nothing matches this filter yet."
            }
          />
        )}
      </div>
    </main>
  );
}
