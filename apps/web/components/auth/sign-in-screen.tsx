"use client";

import { UserRejectedRequestError } from "viem";
import {
  useAccount,
  useChains,
  useConnect,
  useConnectors,
  useSwitchChain,
} from "wagmi";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSiweSignIn } from "@/hooks/use-siwe-sign-in";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof UserRejectedRequestError) {
    return "Signature request was cancelled.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export function SignInScreen() {
  const { address, isConnected, chainId } = useAccount();
  const connectors = useConnectors();
  const chains = useChains();
  const {
    mutate: connect,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();
  const {
    signIn,
    isPending: isSigning,
    error: signInError,
  } = useSiweSignIn();

  const isSupportedChain = chains.some((chain) => chain.id === chainId);

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--surface-page)] px-4 font-sans">
      <div className="w-full max-w-sm">
        <Card
          title="Sign in to Handler"
          subtitle="Connect your wallet and sign a message to continue — this doesn't cost gas."
        >
          <div className="flex flex-col gap-3">
            {!isConnected && (
              <Button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isConnecting || connectors.length === 0}
              >
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </Button>
            )}

            {isConnected && !isSupportedChain && (
              <>
                <Banner status="error">
                  This wallet is on an unsupported network.
                </Banner>
                <Button
                  onClick={() => switchChain({ chainId: chains[0].id })}
                  disabled={isSwitching}
                >
                  {isSwitching ? "Switching…" : `Switch to ${chains[0].name}`}
                </Button>
              </>
            )}

            {isConnected && isSupportedChain && address && (
              <Button onClick={() => signIn()} disabled={isSigning}>
                {isSigning
                  ? "Waiting for signature…"
                  : `Sign in as ${truncateAddress(address)}`}
              </Button>
            )}

            {connectError && (
              <Banner status="error">{errorMessage(connectError)}</Banner>
            )}
            {signInError && (
              <Banner status="error">{errorMessage(signInError)}</Banner>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
