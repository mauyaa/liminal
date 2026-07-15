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

const STATUS_COPY: Record<string, string> = {
  INITIALIZED: "Listed - waiting for a buyer to fund escrow.",
  FUNDED: "Funds are locked in escrow until you confirm delivery - or the deadline passes and they're refunded automatically.",
  SETTLED: "Complete - escrow released to the seller.",
  REFUNDED: "Refunded - escrow returned to the buyer in full.",
};

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

  const status = order?.onChain?.status ?? order?.escrowStatus;
  const isBuyer = !!publicKey && !!order?.onChain?.buyer && publicKey.toBase58() === order.onChain.buyer;
  const deadline = order?.onChain?.deliveryDeadline ?? 0;
  const busy = actionState === "building" || actionState === "signing" || actionState === "sending";

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

            <div className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] tracking-wide text-muted">
                  {status}
                </span>
              </div>
              <p className="text-sm leading-6 text-muted">{STATUS_COPY[status ?? ""] ?? ""}</p>
              {status === "FUNDED" && deadline > 0 && (
                <p className="text-[13px] text-muted">
                  {order.onChain?.refundableNow
                    ? "The delivery deadline has passed - a refund can be claimed now (and is also processed automatically)."
                    : `Not delivered? Automatically refundable after ${new Date(deadline * 1000).toLocaleString()}.`}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <WalletMultiButton />

              {status === "FUNDED" && isBuyer && !order.onChain?.refundableNow && (
                <button
                  onClick={() => runLifecycleAction("settle")}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {busy ? "Confirm in wallet…" : "Confirm receipt - release funds to seller"}
                </button>
              )}

              {status === "FUNDED" && publicKey && order.onChain?.refundableNow && (
                <button
                  onClick={() => runLifecycleAction("refund")}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {busy ? "Confirm in wallet…" : "Claim refund now"}
                </button>
              )}

              {status === "FUNDED" && !publicKey && (
                <p className="text-sm text-muted">
                  Connect the buyer&apos;s wallet to confirm receipt, or any wallet to trigger a
                  refund once the deadline passes.
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
                  Funding transaction
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
