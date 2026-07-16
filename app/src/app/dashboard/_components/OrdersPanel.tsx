"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { MERCHANT_STATUS } from "./shared";

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
        <span className="font-medium text-foreground">&quot;Paid — deliver&quot; means deliver
        now</span>{" "}
        — the money is locked in escrow waiting on you. &quot;Paid out&quot; means it&apos;s
        yours.
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders yet. Share a checkout link to get your first one.</p>
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
                  {MERCHANT_STATUS[o.escrowStatus] ?? o.escrowStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
