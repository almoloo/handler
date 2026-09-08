"use client";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { AppNav } from "@/components/domain/app-nav";
import { NotificationToastLayer } from "@/components/domain/notification-toast-layer";
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

  return (
    <>
      <AppNav />
      <NotificationToastLayer />
      {/* pb-20 clears the fixed bottom nav below `md`; at `md`+ the nav is
          static (in normal flow), so no compensating padding is needed. */}
      <div className="pb-20 md:pb-0">{children}</div>
    </>
  );
}
