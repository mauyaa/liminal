"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

interface OrderDetail {
  orderPda: string;
  escrowStatus: string;
  buyerWallet: string | null;
  fundTxSignature: string | null;
  resolutionTxSignature: string | null;
  deliveryNote: string | null;
  sku: string;
  title: string;
  imageUrl: string;
  priceUsdc: number;
  mint: string;
  merchantWallet: string;
  storeName: string;
  onChain: {
    status: string;
    buyer: string | null;
    principalBaseUnits: string;
    startTimestamp: number;
    deliveryDeadline: number;
    challengeDeadline: number;
    refundableNow: boolean;
  } | null;
}

type ActionState = "idle" | "building" | "signing" | "sending" | "done" | "error";
type SignalState = "idle" | "signing" | "sending" | "error";

/** "in 2d 4h" / "in 45m" / "any moment now" for a unix-seconds deadline. */
function formatCountdown(deadlineSeconds: number, nowMs: number): string {
  const diffMs = deadlineSeconds * 1000 - nowMs;
  if (diffMs <= 0) return "any moment now";
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

/** The exact on-chain lifecycle, expressed in buyer language. */
function Timeline({ status }: { status: string }) {
  const finalLabel = status === "REFUNDED" ? "Refunded" : "Complete";
  const nodes = ["Payment protected", "Await delivery", finalLabel];
  const reached =
    status === "SETTLED" || status === "REFUNDED"
      ? 2
      : status === "FUNDED" || status === "DELIVERY_SIGNALED" || status === "DISPUTED"
        ? 1
        : 0;

  return (
    <div className="flex items-start">
      {nodes.map((label, i) => {
        const done = i < reached || reached === 2;
        const current = i === reached && reached !== 2;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div
                className={`h-px flex-1 ${i === 0 ? "bg-transparent" : done || current ? "bg-foreground" : "bg-border"}`}
              />
              <div
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  done ? "bg-foreground" : current ? "border-2 border-foreground bg-background" : "border border-border bg-background"
                }`}
              />
              <div
                className={`h-px flex-1 ${i === nodes.length - 1 ? "bg-transparent" : done ? "bg-foreground" : "bg-border"}`}
              />
            </div>
            <span
              className={`text-center text-[11px] leading-4 tracking-wide ${
                done || current ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderPage() {
  const { orderPda } = useParams<{ orderPda: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signMessage } = useWallet();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [deliveryNote, setDeliveryNote] = useState("");
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalError, setSignalError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderPda}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "Failed to load order");
    setOrder(body);
  }, [orderPda]);

  useEffect(() => {
    // Genuine fetch-on-mount, matching the dashboard panels' convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => setLoadError(err.message));
  }, [refresh]);

  const runLifecycleAction = useCallback(
    async (kind: "settle" | "refund" | "confirm" | "challenge") => {
      if (!publicKey || !signTransaction) return;
      setActionError(null);
      setActionState("building");
      try {
        const res = await fetch(`/api/orders/${orderPda}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "refund" ? { payerWallet: publicKey.toBase58() } : {}),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Failed to build ${kind} transaction`);

        setActionState("signing");
        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);

        setActionState("sending");
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        await fetch("/api/orders/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderPda, resolutionTxSignature: sig }),
        }).catch(() => {});

        setActionState("done");
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `${kind} failed`);
        setActionState("error");
      }
    },
    [publicKey, signTransaction, connection, orderPda, refresh]
  );

  const signalDelivery = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setSignalError(null);
    setSignalState("signing");
    try {
      const message = new TextEncoder().encode(`mark-delivered:${orderPda}`);
      const signatureBytes = await signMessage(message);
      const signature = bs58.encode(signatureBytes);

      setSignalState("sending");
      const res = await fetch(`/api/orders/${orderPda}/signal-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerWallet: publicKey.toBase58(),
          deliveryNote: deliveryNote || undefined,
          signature,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to mark delivered");

      setSignalState("idle");
      await refresh();
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : "Failed to mark delivered");
      setSignalState("error");
    }
  }, [publicKey, signMessage, orderPda, deliveryNote, refresh]);

  const status = order?.onChain?.status ?? order?.escrowStatus ?? "";
  const isBuyer = !!publicKey && !!order?.onChain?.buyer && publicKey.toBase58() === order.onChain.buyer;
  const isSeller = !!publicKey && publicKey.toBase58() === order?.merchantWallet;
  const deadline = order?.onChain?.deliveryDeadline ?? 0;
  const challengeDeadline = order?.onChain?.challengeDeadline ?? 0;
  const refundable = !!order?.onChain?.refundableNow;
  const busy = actionState === "building" || actionState === "signing" || actionState === "sending";
  const busyLabel =
    actionState === "building" ? "Preparing…" : actionState === "signing" ? "Confirm in your wallet…" : "Sending…";

  return (
    <div className="route-shell">
      <main className="route-main route-main--narrow">
        <div className="route-heading"><h1 className="route-title">Track the promise.</h1><p className="route-lede">See exactly where the payment is, what has happened, and what moves it next.</p></div>
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {order && (
          <>
            <div className="surface flex items-center gap-5 p-5 sm:p-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.imageUrl}
                alt={order.title}
                className="h-20 w-20 rounded-2xl border border-border object-cover"
              />
              <div className="flex flex-col gap-0.5">
                <h2 className="font-serif text-3xl tracking-[-.04em]">{order.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {order.storeName} · ${(order.priceUsdc / 1_000_000).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-8 rounded-[28px] border border-border bg-[#ded8ce] px-6 py-7 sm:px-9 sm:py-10">
              <Timeline status={status} />

              {status === "INITIALIZED" && (
                <p className="text-sm leading-6 text-muted">
                  Not yet purchased — this listing is live and waiting for a buyer.
                </p>
              )}

              {status === "FUNDED" && !refundable && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl leading-[1] tracking-[-.04em]">Your money is locked, not spent.</p>
                  <p className="mt-4 max-w-xl text-[13px] leading-6 text-muted">
                    Once your order arrives, confirm below to release the payment. Not delivered
                    by <span className="font-medium text-foreground">{deadline > 0 ? new Date(deadline * 1000).toLocaleString() : "the deadline"}</span>
                    {deadline > 0 && <span className="font-medium text-foreground"> ({formatCountdown(deadline, now)})</span>}?
                    You get refunded automatically — no action needed.
                  </p>
                </div>
              )}

              {status === "FUNDED" && refundable && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl tracking-[-.04em]">Delivery deadline passed.</p>
                  <p className="mt-4 text-[13px] leading-6 text-muted">
                    You can claim your refund now — or do nothing, it&apos;s processed
                    automatically.
                  </p>
                </div>
              )}

              {status === "DELIVERY_SIGNALED" && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl leading-[1] tracking-[-.04em]">Delivered — auto-releases soon.</p>
                  <p className="mt-4 max-w-xl text-[13px] leading-6 text-muted">
                    The seller marked this delivered. It releases to them automatically
                    {challengeDeadline > 0 && (
                      <> <span className="font-medium text-foreground">{formatCountdown(challengeDeadline, now)}</span></>
                    )}{" "}
                    unless you flag a problem first.
                  </p>
                </div>
              )}

              {status === "DISPUTED" && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl tracking-[-.04em]">Under review.</p>
                  <p className="mt-4 max-w-xl text-[13px] leading-6 text-muted">
                    You flagged a problem with this delivery. Resolving disputes isn&apos;t
                    automated yet — this is a manual step for now, not an instant verdict.
                  </p>
                </div>
              )}

              {status === "SETTLED" && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl tracking-[-.04em]">Order complete.</p>
                  <p className="text-[13px] leading-5 text-muted">
                    You confirmed delivery and the seller was paid. Thanks for using escrow that
                    just works.
                  </p>
                </div>
              )}

              {status === "REFUNDED" && (
                <div className="flex flex-col gap-1">
                  <p className="font-serif text-3xl tracking-[-.04em]">Refunded in full.</p>
                  <p className="text-[13px] leading-5 text-muted">
                    Delivery wasn&apos;t confirmed by the deadline, so your payment came straight
                    back. That&apos;s the whole point.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <WalletMultiButton />

              {status === "FUNDED" && isBuyer && !refundable && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => runLifecycleAction("settle")}
                    disabled={busy}
                    className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {busy ? busyLabel : "Confirm receipt - release funds to seller"}
                  </button>
                  <p className="text-[12px] leading-4 text-muted">
                    Only confirm once you actually have your order. This releases the money and
                    can&apos;t be undone.
                  </p>
                </div>
              )}

              {status === "FUNDED" && isSeller && !refundable && (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Optional: link to what you delivered"
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-foreground/40"
                  />
                  <button
                    onClick={signalDelivery}
                    disabled={signalState === "signing" || signalState === "sending"}
                    className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {signalState === "signing"
                      ? "Confirm in your wallet…"
                      : signalState === "sending"
                        ? "Marking delivered…"
                        : "Mark as delivered"}
                  </button>
                  <p className="text-[12px] leading-4 text-muted">
                    No transaction fee - just a free signature proving you&apos;re the seller.
                    Opens a 48-hour window before the buyer&apos;s payment auto-releases.
                  </p>
                  {signalError && <p className="text-sm text-red-500">{signalError}</p>}
                </div>
              )}

              {status === "DELIVERY_SIGNALED" && isBuyer && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => runLifecycleAction("confirm")}
                    disabled={busy}
                    className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {busy ? busyLabel : "Confirm now - release funds"}
                  </button>
                  <button
                    onClick={() => runLifecycleAction("challenge")}
                    disabled={busy}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
                  >
                    Something&apos;s wrong
                  </button>
                </div>
              )}

              {status === "FUNDED" && publicKey && refundable && (
                <button
                  onClick={() => runLifecycleAction("refund")}
                  disabled={busy}
                  className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {busy ? busyLabel : "Claim refund now"}
                </button>
              )}

              {status === "FUNDED" && !isBuyer && !isSeller && !refundable && (
                <p className="text-sm text-muted">
                  Connect the buyer&apos;s or seller&apos;s wallet to manage this order.
                </p>
              )}

              {actionError && <p className="text-sm text-red-500">{actionError}</p>}
            </div>

            <div className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-[12px] text-muted sm:grid-cols-2">
              {order.fundTxSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${order.fundTxSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Payment transaction
                </a>
              )}
              {order.resolutionTxSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${order.resolutionTxSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {status === "REFUNDED" ? "Refund transaction" : "Settlement transaction"}
                </a>
              )}
              <span className="break-all font-mono text-[11px]">{order.orderPda}</span>
              <Link href="/orders" className="underline">
                All my orders
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
