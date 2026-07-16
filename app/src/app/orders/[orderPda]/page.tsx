"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";

interface OrderDetail {
  orderPda: string;
  escrowStatus: string;
  buyerWallet: string | null;
  fundTxSignature: string | null;
  resolutionTxSignature: string | null;
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
    refundableNow: boolean;
  } | null;
}

type ActionState = "idle" | "building" | "signing" | "sending" | "done" | "error";

/** Paid -> In escrow -> Delivered? -> Complete/Refunded, current node emphasized. */
function Timeline({ status }: { status: string }) {
  const finalLabel = status === "REFUNDED" ? "Refunded" : "Complete";
  const nodes = ["Paid", "In escrow", "Delivered?", finalLabel];
  // Index of the furthest node reached for each status.
  const reached =
    status === "SETTLED" || status === "REFUNDED" ? 3 : status === "FUNDED" ? 2 : -1;

  return (
    <div className="flex items-start">
      {nodes.map((label, i) => {
        const done = i < reached || reached === 3;
        const current = i === reached && reached !== 3;
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
  const { publicKey, signTransaction } = useWallet();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

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
    async (kind: "settle" | "refund") => {
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

  const status = order?.onChain?.status ?? order?.escrowStatus ?? "";
  const isBuyer = !!publicKey && !!order?.onChain?.buyer && publicKey.toBase58() === order.onChain.buyer;
  const deadline = order?.onChain?.deliveryDeadline ?? 0;
  const refundable = !!order?.onChain?.refundableNow;
  const busy = actionState === "building" || actionState === "signing" || actionState === "sending";
  const busyLabel =
    actionState === "building" ? "Preparing…" : actionState === "signing" ? "Confirm in your wallet…" : "Sending…";

  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {order && (
          <>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.imageUrl}
                alt={order.title}
                className="h-16 w-16 rounded-lg border border-border object-cover"
              />
              <div className="flex flex-col gap-0.5">
                <h1 className="text-lg font-semibold tracking-tight">{order.title}</h1>
                <p className="text-sm text-muted">
                  {order.storeName} · ${(order.priceUsdc / 1_000_000).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border px-4 py-4">
              <Timeline status={status} />

              {status === "INITIALIZED" && (
                <p className="text-sm leading-6 text-muted">
                  Not yet purchased — this listing is live and waiting for a buyer.
                </p>
              )}

              {status === "FUNDED" && !refundable && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Your payment is protected in escrow.</p>
                  <p className="text-[13px] leading-5 text-muted">
                    Once your order arrives, confirm below to release the payment. Not delivered
                    by <span className="font-medium text-foreground">{deadline > 0 ? new Date(deadline * 1000).toLocaleString() : "the deadline"}</span>?
                    You get refunded automatically — no action needed.
                  </p>
                </div>
              )}

              {status === "FUNDED" && refundable && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Delivery deadline passed.</p>
                  <p className="text-[13px] leading-5 text-muted">
                    You can claim your refund now — or do nothing, it&apos;s processed
                    automatically.
                  </p>
                </div>
              )}

              {status === "SETTLED" && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Order complete.</p>
                  <p className="text-[13px] leading-5 text-muted">
                    You confirmed delivery and the seller was paid. Thanks for using escrow that
                    just works.
                  </p>
                </div>
              )}

              {status === "REFUNDED" && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Refunded in full.</p>
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
                    className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                  >
                    {busy ? busyLabel : "Confirm receipt - release funds to seller"}
                  </button>
                  <p className="text-[12px] leading-4 text-muted">
                    Only confirm once you actually have your order. This releases the money and
                    can&apos;t be undone.
                  </p>
                </div>
              )}

              {status === "FUNDED" && publicKey && refundable && (
                <button
                  onClick={() => runLifecycleAction("refund")}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {busy ? busyLabel : "Claim refund now"}
                </button>
              )}

              {status === "FUNDED" && !isBuyer && !refundable && (
                <p className="text-sm text-muted">
                  Connect the buying wallet to manage this order.
                </p>
              )}

              {actionError && <p className="text-sm text-red-500">{actionError}</p>}
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-4 text-[13px] text-muted">
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
