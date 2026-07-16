"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";

interface PlanMetadata {
  title: string;
  description: string;
  icon: string;
  label: string;
}

interface SubscribeResponse {
  transaction: string;
  message: string;
  requiresFollowUp: boolean;
  subscriptionPda?: string;
}

type SubState = "idle" | "authorizing" | "subscribing" | "confirmed" | "error";
type CancelState = "idle" | "cancelling" | "cancelled" | "error";

async function signSendConfirm(
  base64Tx: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  connection: ReturnType<typeof useConnection>["connection"]
): Promise<string> {
  const tx = Transaction.from(Buffer.from(base64Tx, "base64"));
  const signed = await signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export default function SubscribePage() {
  const { planId } = useParams<{ planId: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [plan, setPlan] = useState<PlanMetadata | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subState, setSubState] = useState<SubState>("idle");
  const [subError, setSubError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const [cancelState, setCancelState] = useState<CancelState>("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/actions/subscribe/${planId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to load plan");
        setPlan(body);
      })
      .catch((err) => setLoadError(err.message));
  }, [planId]);

  const postSubscribe = useCallback(
    async (account: string): Promise<SubscribeResponse> => {
      const res = await fetch(`/api/actions/subscribe/${planId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to build transaction");
      return body;
    },
    [planId]
  );

  const handleSubscribe = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setSubError(null);
    try {
      setSubState("authorizing");
      let response = await postSubscribe(publicKey.toBase58());

      // First-time subscriber: this response only sets up the subscription
      // authority. Once it lands, re-POST the same body to get the real
      // Subscribe transaction, bound to live on-chain terms.
      if (response.requiresFollowUp) {
        await signSendConfirm(response.transaction, signTransaction, connection);
        setSubState("subscribing");
        response = await postSubscribe(publicKey.toBase58());
      } else {
        setSubState("subscribing");
      }

      const sig = await signSendConfirm(response.transaction, signTransaction, connection);

      await fetch("/api/subscriptions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, subscriber: publicKey.toBase58() }),
      }).catch(() => {});

      setSignature(sig);
      setSubState("confirmed");
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Subscribe failed");
      setSubState("error");
    }
  }, [publicKey, signTransaction, connection, planId, postSubscribe]);

  const handleCancel = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setCancelError(null);
    setCancelState("cancelling");
    try {
      const res = await fetch(`/api/subscriptions/${planId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriber: publicKey.toBase58() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to build cancel transaction");

      await signSendConfirm(body.transaction, signTransaction, connection);
      setCancelState("cancelled");
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
      setCancelState("error");
    }
  }, [publicKey, signTransaction, connection, planId]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <main className="flex w-full max-w-sm flex-col gap-6">
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {plan && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={plan.icon}
              alt={plan.title}
              className="aspect-square w-full rounded-xl border border-border object-cover"
            />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">{plan.title}</h1>
              <p className="text-sm leading-6 text-muted">{plan.description}</p>
            </div>

            <div className="rounded-lg border border-border bg-foreground/[0.03] px-4 py-3">
              <p className="text-[13px] leading-5 text-muted">
                You&apos;re authorizing this plan to collect its price once per billing period.
                Cancel anytime — cancellation is enforced on-chain, not by the merchant&apos;s
                goodwill.
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <WalletMultiButton />
              {publicKey && subState === "idle" && (
                <p className="text-[12px] text-muted">
                  First time subscribing with this wallet? You&apos;ll approve twice — step 1 is a
                  one-time setup of your subscription account, step 2 is the subscription itself.
                </p>
              )}

              {publicKey && subState !== "confirmed" && (
                <button
                  onClick={handleSubscribe}
                  disabled={subState === "authorizing" || subState === "subscribing"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {subState === "authorizing"
                    ? "Setting up (1/2)…"
                    : subState === "subscribing"
                      ? "Subscribing (2/2)…"
                      : plan.label}
                </button>
              )}

              {subState === "confirmed" && signature && (
                <div className="flex flex-col gap-1 text-sm">
                  <p className="font-medium text-green-600 dark:text-green-400">Subscribed.</p>
                  <p className="text-muted">
                    Each period&apos;s payment collects automatically. Manage it right here,
                    anytime.
                  </p>
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-muted underline"
                  >
                    View transaction
                  </a>
                </div>
              )}

              {subError && <p className="text-sm text-red-500">{subError}</p>}

              {publicKey && (
                <div className="flex flex-col gap-1 border-t border-border pt-4">
                  <button
                    onClick={handleCancel}
                    disabled={cancelState === "cancelling"}
                    className="inline-flex h-9 w-fit items-center justify-center rounded-full border border-border px-4 text-xs font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {cancelState === "cancelling" ? "Cancelling…" : "Cancel subscription"}
                  </button>
                  <p className="text-[13px] text-muted">
                    Takes effect at the end of your current paid period — you keep what you paid
                    for, and nothing collects after.
                  </p>
                  {cancelState === "cancelled" && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Cancellation confirmed on-chain. No further payments can be collected after
                      this period.
                    </p>
                  )}
                  {cancelError && <p className="text-sm text-red-500">{cancelError}</p>}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
