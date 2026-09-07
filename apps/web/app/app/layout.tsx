"use client";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { useSession } from "@/hooks/use-session";
import { useSyncSessionWithWallet } from "@/hooks/use-sync-session-with-wallet";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  const { data: session, isLoading } = useSession();
  useSyncSessionWithWallet();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-page)] font-sans">
        <p className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
          Loading…
        </p>
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <>{children}</>;
}
