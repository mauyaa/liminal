"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { EmptyState, StatusChip } from "./ui";

interface OrderRow {
  orderPda: string;
  escrowStatus: string;
  buyerWallet: string | null;
  sku: string;
  title: string;
  imageUrl: string;
  priceUsdc: number;
  createdAt: string;
}

export default function OrdersPanel() {
  const { publicKey } = useWallet();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?merchantWallet=${publicKey.toBase58()}`);
      const body = await res.json();
      setOrders(body.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const orderedByAction = [...orders].sort((a, b) => {
    if (a.escrowStatus === "FUNDED" && b.escrowStatus !== "FUNDED") return -1;
    if (b.escrowStatus === "FUNDED" && a.escrowStatus !== "FUNDED") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-medium tracking-tight">
            Orders {loading && <span className="font-normal text-muted">refreshing…</span>}
          </h2>
          <p className="text-[12px] text-muted">
            <span className="font-medium text-foreground">&quot;Paid — deliver&quot; means deliver
            now</span>{" "}
            — the money is in escrow waiting on you.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-border px-4 text-xs font-medium transition-colors hover:bg-foreground/5"
        >
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <EmptyState message="No orders yet. Share a checkout link to get your first one." />
      ) : (
        <ul className="flex flex-col gap-2">
          {orderedByAction.map((o) => (
            <li key={o.orderPda}>
              <Link
                href={`/orders/${o.orderPda}`}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-foreground/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={o.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{o.title}</span>
                  <span className="truncate text-[12px] text-muted">
                    {o.sku} · ${(o.priceUsdc / 1_000_000).toFixed(2)}
                    {o.buyerWallet && (
                      <span className="font-mono">
                        {" "}· buyer {o.buyerWallet.slice(0, 4)}..{o.buyerWallet.slice(-4)}
                      </span>
                    )}
                  </span>
                </div>
                <StatusChip status={o.escrowStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
