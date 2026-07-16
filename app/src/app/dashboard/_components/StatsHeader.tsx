"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Stats {
  listings: number;
  ordersByStatus: Record<string, number>;
  settledVolumeBaseUnits: number;
  subscriptionPlans: number;
  subscribers: number;
}

export default function StatsHeader() {
  const { publicKey } = useWallet();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/merchant/stats?merchantWallet=${publicKey.toBase58()}`)
      .then((res) => res.json())
       
      .then(setStats)
      .catch(() => {});
  }, [publicKey]);

  if (!stats) return null;

  const cards: { label: string; value: string | number; sub?: string }[] = [
    { label: "Settled volume", value: `$${(stats.settledVolumeBaseUnits / 1_000_000).toFixed(2)}` },
    { label: "In escrow", value: stats.ordersByStatus.FUNDED ?? 0, sub: "waiting on delivery" },
    { label: "Settled", value: stats.ordersByStatus.SETTLED ?? 0 },
    { label: "Listings", value: stats.listings },
    { label: "Subscribers", value: stats.subscribers },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="flex min-h-28 flex-col rounded-2xl border border-border bg-surface p-4">
          <span className="text-[9px] font-semibold tracking-[.1em] text-muted uppercase">{c.label}</span>
          <span className="mt-auto font-serif text-3xl tracking-[-.04em]">{c.value}</span>
          {c.sub && <span className="text-[10px] leading-3 text-muted">{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}
