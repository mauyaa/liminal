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
    <div className="route-shell">
      <main className="route-main">
        <div className="route-heading"><h1 className="route-title">Subscribe on your terms.</h1><p className="route-lede">The amount, frequency and cancellation rules are enforced by the payment—not a merchant promise.</p></div>
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {plan && (
          <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr]">
            <section className="overflow-hidden rounded-[36px] border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={plan.icon}
              alt={plan.title}
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="p-7 sm:p-10">
              <h2 className="mt-6 font-serif text-3xl leading-[1] tracking-[-.04em] sm:text-4xl">{plan.title}</h2>
              <p className="mt-5 text-sm leading-6 text-muted">{plan.description}</p>
            </div>
            </section>

            <section className="flex flex-col rounded-[36px] bg-[#ded8ce] p-7 sm:p-10">
            <div className="border-b border-foreground/20 pb-7">
              <p className="mt-4 text-[13px] leading-6 text-muted">
                You&apos;re authorizing this plan to collect its price once per billing period.
                Cancel anytime — cancellation is enforced on-chain, not by the merchant&apos;s
                goodwill.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-4">
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
                  className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {subState === "authorizing"
                    ? "Setting up (1/2)…"
                    : subState === "subscribing"
                      ? "Subscribing (2/2)…"
                      : plan.label}
                </button>
              )}

              {subState === "confirmed" && signature && (
                <div className="rounded-2xl bg-foreground p-6 text-sm text-white">
                  <p className="font-serif text-3xl tracking-[-.04em] text-accent">Subscribed.</p>
                  <p className="mt-3 text-white/60">
                    Each period&apos;s payment collects automatically. Manage it right here,
                    anytime.
                  </p>
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block font-mono text-[10px] text-white/50 underline"
                  >
                    View transaction
                  </a>
                </div>
              )}

              {subError && <p className="text-sm text-red-500">{subError}</p>}

              {publicKey && (
                <div className="mt-4 flex flex-col gap-2 border-t border-foreground/15 pt-5">
                  <button
                    onClick={handleCancel}
                    disabled={cancelState === "cancelling"}
                    className="inline-flex h-10 w-fit items-center justify-center rounded-xl border border-foreground/20 px-4 text-xs font-semibold transition-colors hover:bg-white/30 disabled:opacity-50"
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
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
