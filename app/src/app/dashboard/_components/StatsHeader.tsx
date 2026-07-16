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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5">
          <span className="text-[11px] tracking-wide text-muted">{c.label}</span>
          <span className="text-lg font-semibold tracking-tight">{c.value}</span>
          {c.sub && <span className="text-[10px] leading-3 text-muted">{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}
