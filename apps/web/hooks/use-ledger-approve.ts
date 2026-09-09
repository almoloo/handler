"use client";

import { useCallback, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { sendRawTransaction } from "viem/actions";
import { encodeFunctionData, hexToBytes, serializeTransaction } from "viem";
import {
  DeviceActionStatus,
  type ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { connectLedger, getDmk } from "@/lib/ledger";
import { handlerWalletAbi } from "@/lib/contracts";
import { useSession } from "@/hooks/use-session";
import { useWalletAddress } from "@/hooks/use-wallet-address";

export type LedgerApproveStatus =
  | "idle"
  | "connecting"
  | "matching"
  | "awaiting-device-confirmation"
  | "broadcasting"
  | "success"
  | "error";

/** Hackathon-scoped simplification, not a general multi-account picker
 * (current-feature.md's 6b spec, Data/contracts): tries the first five
 * standard indices rather than exposing an account-selection UI. */
const CANDIDATE_DERIVATION_PATHS = Array.from(
  { length: 5 },
  (_, i) => `44'/60'/0'/0/${i}`,
);

/** Resolves a DMK `ExecuteDeviceActionReturnType`'s observable into a
 * promise: the device action's real completion, not just its first tick. */
function waitForDeviceAction<Output, ActionError, IntermediateValue>(
  action: ExecuteDeviceActionReturnType<Output, ActionError, IntermediateValue>,
): Promise<Output> {
  return new Promise((resolve, reject) => {
    const subscription = action.observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          subscription.unsubscribe();
          resolve(state.output);
        } else if (state.status === DeviceActionStatus.Error) {
          subscription.unsubscribe();
          reject(state.error);
        } else if (state.status === DeviceActionStatus.Stopped) {
          subscription.unsubscribe();
          reject(new Error("Ledger action was stopped"));
        }
      },
      error: (err: unknown) => {
        subscription.unsubscribe();
        reject(err);
      },
    });
  });
}

/**
 * The Ledger co-sign flow for `approve(id)` — bypasses wagmi's
 * `useWriteContract` entirely, since no maintained wagmi-Ledger connector
 * exists (current-feature.md's 6b spec, "Pre-spec technical correction").
 * Discovers + connects a device, finds which of a handful of standard
 * derivation paths derives the session's owner address, signs a plain
 * `approve(id)` call, and broadcasts the raw signed tx directly via viem —
 * unverifiable against a real device in this environment; every call here
 * was re-checked against the installed SDKs' own `.d.ts` files
 * (`lib/ledger.ts`'s doc comment), not assumed.
 *
 * Targets the connected owner's own factory-created wallet
 * (`useWalletAddress()`), not a static config address — a `PendingApproval`
 * only exists for a wallet this session owns (`ApprovalsService.findForWallet`
 * 404s otherwise), so this resolution always matches the approval being signed.
 */
export function useLedgerApprove() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { data: session } = useSession();
  const { walletAddress } = useWalletAddress();
  const [status, setStatus] = useState<LedgerApproveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const approve = useCallback(
    async (id: `0x${string}`) => {
      if (!publicClient || !session || !walletAddress) return;
      setError(null);
      setTxHash(null);

      try {
        setStatus("connecting");
        // Must run as a direct result of this click — see lib/ledger.ts.
        const sessionId = await connectLedger();
        const signerEth = new SignerEthBuilder({
          dmk: getDmk(),
          sessionId,
        }).build();

        setStatus("matching");
        const ownerAddress = session.address.toLowerCase();
        let matchedPath: string | null = null;
        for (const path of CANDIDATE_DERIVATION_PATHS) {
          const { address } = await waitForDeviceAction(
            signerEth.getAddress(path),
          );
          if (address.toLowerCase() === ownerAddress) {
            matchedPath = path;
            break;
          }
        }
        if (!matchedPath) {
          throw new Error(
            "Connect the Ledger holding this wallet's owner key.",
          );
        }

        const to = walletAddress;
        const data = encodeFunctionData({
          abi: handlerWalletAbi,
          functionName: "approve",
          args: [id],
        });
        const [nonce, fees, gas] = await Promise.all([
          publicClient.getTransactionCount({
            address: ownerAddress as `0x${string}`,
            blockTag: "pending",
          }),
          publicClient.estimateFeesPerGas(),
          publicClient.estimateGas({
            account: ownerAddress as `0x${string}`,
            to,
            data,
            value: BigInt(0),
          }),
        ]);

        const unsignedTx = {
          to,
          data,
          value: BigInt(0),
          nonce,
          chainId,
          gas,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          type: "eip1559",
        } as const;

        setStatus("awaiting-device-confirmation");
        const unsignedBytes = hexToBytes(serializeTransaction(unsignedTx));
        const signature = await waitForDeviceAction(
          signerEth.signTransaction(matchedPath, unsignedBytes),
        );

        const signedTx = serializeTransaction(unsignedTx, {
          r: signature.r,
          s: signature.s,
          v: BigInt(signature.v),
        });

        setStatus("broadcasting");
        const hash = await sendRawTransaction(publicClient, {
          serializedTransaction: signedTx,
        });

        setTxHash(hash);
        setStatus("success");
      } catch (err) {
        console.error("Ledger approve failed", err);
        setError(
          err instanceof Error && err.message.startsWith("Connect the Ledger")
            ? err.message
            : "That didn't go through. Check the connected Ledger and try again.",
        );
        setStatus("error");
      }
    },
    [chainId, publicClient, session, walletAddress],
  );

  return { approve, status, error, txHash };
}
