"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

interface OrderRow {
  orderPda: string;
  escrowStatus: string;
  buyerWallet: string | null;
  sku: string;
  title: string;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-tight">
          Orders across your listings {loading && <span className="text-muted">(refreshing…)</span>}
        </h2>
        <button
          onClick={refresh}
          className="inline-flex h-8 items-center justify-center rounded-full border border-border px-4 text-xs font-medium transition-colors hover:bg-foreground/5"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-muted">
        FUNDED means a buyer&apos;s payment is in escrow - your cue to deliver. SETTLED means
        the funds were released to you.
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.orderPda}>
              <Link
                href={`/orders/${o.orderPda}`}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-foreground/5"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{o.title}</span>
                  <span className="text-muted">
                    {o.sku} · ${(o.priceUsdc / 1_000_000).toFixed(2)}
                    {o.buyerWallet && (
                      <span className="font-mono">
                        {" "}· buyer {o.buyerWallet.slice(0, 4)}..{o.buyerWallet.slice(-4)}
                      </span>
                    )}
                  </span>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] tracking-wide text-muted">
                  {o.escrowStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
