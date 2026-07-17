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
  FUNDED: "Awaiting delivery",
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
    <div className="route-shell">
      <main className="route-main route-main--narrow">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="route-heading"><h1 className="route-title">Your orders.</h1><p className="route-lede">Every protected purchase, with its live escrow state and the next action that matters.</p></div>
          <WalletMultiButton />
        </div>

        {!publicKey ? (
          <div className="surface p-8 sm:p-12"><h2 className="font-serif text-3xl tracking-[-.04em]">Connect the wallet you purchased with.</h2><p className="mt-3 text-sm leading-6 text-muted">There are no Liminal accounts. Your wallet is the private key to your purchase history.</p></div>
        ) : loading ? (
          <p className="route-lede">Loading orders…</p>
        ) : orders.length === 0 ? (
          <div className="surface p-8 sm:p-12"><h2 className="font-serif text-3xl tracking-[-.04em]">Nothing here yet.</h2><p className="mt-3 text-sm leading-6 text-muted">Every Liminal purchase appears here with its live escrow status.</p><Link href="/pay/liminal-demo-1" className="mt-6 inline-flex rounded-xl bg-foreground px-5 py-3 text-xs font-semibold text-white">Try the demo checkout ↗</Link></div>
        ) : (
          <ul className="overflow-hidden rounded-[28px] border border-border bg-surface">
            {orders.map((o) => (
              <li key={o.orderPda} className="border-b border-border last:border-b-0">
                <Link
                  href={`/orders/${o.orderPda}`}
                  className="group flex items-center justify-between gap-5 px-5 py-5 text-sm transition-colors hover:bg-foreground/[.035] sm:px-7"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-serif text-xl tracking-[-.03em]">{o.title}</span>
                    <span className="text-[11px] text-muted">
                      {o.storeName} · ${(o.priceUsdc / 1_000_000).toFixed(2)}
                    </span>
                  </div>
                  <span className="rounded-full bg-foreground/[.06] px-3 py-2 text-[9px] font-semibold tracking-[.08em] text-muted uppercase">
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
