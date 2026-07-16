"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface OrderRow {
  orderPda: string;
  escrowStatus: string;
  sku: string;
  title: string;
  priceUsdc: number;
  storeName: string;
  createdAt: string;
}

/** Buyer-language status vocabulary - see docs/ux-copy-guide.md. */
const BUYER_STATUS: Record<string, string> = {
  INITIALIZED: "Not yet purchased",
  FUNDED: "Payment protected",
  SETTLED: "Complete",
  REFUNDED: "Refunded",
};

export default function OrdersPage() {
  const { publicKey } = useWallet();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?buyerWallet=${publicKey.toBase58()}`);
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
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>
          <WalletMultiButton />
        </div>

        {!publicKey ? (
          <p className="text-sm text-muted">Connect the wallet you purchased with.</p>
        ) : loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted">
            No orders yet for this wallet. Everything you buy through Liminal shows up here with
            live escrow status.
          </p>
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
                      {o.storeName} · ${(o.priceUsdc / 1_000_000).toFixed(2)}
                    </span>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-[11px] tracking-wide text-muted">
                    {BUYER_STATUS[o.escrowStatus] ?? o.escrowStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
