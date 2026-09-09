"use client";

import { useState } from "react";
import { RunList } from "@/components/demo/run-list";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoToken } from "@/hooks/use-demo-token";
import { useSession } from "@/hooks/use-session";
import {
  DEMO_BEATS,
  describeDemoError,
  triggerBeat,
  triggerReset,
  type DemoRun,
} from "@/lib/demo";

/**
 * The demo director's controls. Operator tooling, never linked from the app —
 * the product's copy rules are relaxed here because the audience is whoever
 * wrote the config.
 */
export function Director() {
  const { data: session, isLoading } = useSession();
  const { token, setToken } = useDemoToken();
  const [runs, setRuns] = useState<DemoRun[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The API answers 409 to a second action, but the UI shouldn't invite one.
  // An empty token is a guaranteed 403, so don't let it be sent either.
  const disabled = busy || token.trim() === "";

  /** Newest first: during a take the operator reads the top of the list. */
  async function run(action: () => Promise<DemoRun>) {
    setProblem(null);
    setBusy(true);
    try {
      const result = await action();
      setRuns((previous) => [result, ...previous]);
    } catch (error) {
      setProblem(describeDemoError(error));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">Checking session…</p>;
  }

  if (!session) {
    return (
      <Banner status="pending">
        Not signed in. Open <span className="font-[var(--weight-medium)]">/app</span>,
        connect the showcase wallet and sign in, then come back.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Input
          label="Demo token"
          type="password"
          placeholder="Paste DEMO_TOKEN"
          value={token}
          onChange={setToken}
          hint="Sent as x-demo-token. Kept in this browser only — never in the bundle."
        />
      </section>

      <section className="flex flex-col gap-3">
        {token.trim() === "" && (
          <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
            Paste the demo token to enable the controls.
          </p>
        )}
        {busy && (
          <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            Running… waiting for the chain.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {DEMO_BEATS.map(({ beat, label }) => (
            <Button
              key={beat}
              variant="primary"
              size="lg"
              disabled={disabled}
              onClick={() => run(() => triggerBeat(beat, token))}
            >
              {beat} · {label}
            </Button>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
          <Button
            variant="secondary"
            size="lg"
            disabled={disabled}
            onClick={() => run(() => triggerReset(token))}
          >
            Reset the feed
          </Button>
          <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
            Clears this wallet&apos;s activity so the next take starts empty.
            Sends no transaction.
          </p>
        </div>
      </section>

      {problem && <Banner status="error">{problem}</Banner>}

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
          This session
        </h2>
        <RunList runs={runs} />
      </section>

      <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
        Signed in as {session.address.slice(0, 6)}…{session.address.slice(-4)}
      </p>
    </div>
  );
}
