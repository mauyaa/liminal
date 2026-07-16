"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Stats {
  listings: number;
  ordersByStatus: Record<string, number>;
  settledVolumeBaseUnits: number;
}

interface DashboardHomeProps {
  onNavigate: (tab: "listings" | "orders" | "subscriptions" | "automation") => void;
}

export default function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { publicKey } = useWallet();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/merchant/stats?merchantWallet=${publicKey.toBase58()}`)
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, [publicKey]);

  const listings = stats?.listings ?? 0;
  const funded = stats?.ordersByStatus.FUNDED ?? 0;
  const settled = stats?.ordersByStatus.SETTLED ?? 0;
  const firstAction: "listings" | "orders" = listings === 0 ? "listings" : funded > 0 ? "orders" : "listings";

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-5 rounded-[28px] bg-foreground p-7 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-9">
        <div>
          <p className="text-[10px] font-semibold tracking-[.12em] text-white/45 uppercase">Next best action</p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-[.95] tracking-[-.045em] sm:text-5xl">
            {listings === 0
              ? "Create the checkout your customer will pay through."
              : funded > 0
                ? `${funded} paid ${funded === 1 ? "order needs" : "orders need"} delivery.`
                : "Your checkout is ready. Share it with a customer."}
          </h2>
          <p className="mt-4 max-w-xl text-[13px] leading-6 text-white/55">
            {listings === 0
              ? "Set the price and delivery deadline once. The contract enforces both."
              : funded > 0
                ? "The money is already protected in escrow. Deliver now so the buyer can release it."
                : "When a buyer pays, the order moves here automatically and becomes a delivery task."}
          </p>
        </div>
        <button onClick={() => onNavigate(firstAction)} className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-foreground">
          {listings === 0 ? "Create checkout" : funded > 0 ? "View paid orders" : "Get checkout link"}
        </button>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="font-serif text-3xl tracking-[-.04em]">From link to payout.</h2><p className="mt-2 text-[12px] leading-5 text-muted">Your operating flow, in the order work actually happens.</p></div>
          <span className="text-[11px] text-muted">{settled} completed</span>
        </div>
        <ol className="mt-6 grid overflow-hidden rounded-2xl border border-border md:grid-cols-4">
          {[
            ["1", "Create terms", "Price, product and delivery deadline.", "listings"],
            ["2", "Share checkout", "Send the protected payment link.", "listings"],
            ["3", "Deliver", "Paid orders become your action queue.", "orders"],
            ["4", "Get paid", "Buyer confirms; funds release on-chain.", "orders"],
          ].map(([number, title, body, tab]) => (
            <li key={number} className="border-b border-border p-5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0">
              <button onClick={() => onNavigate(tab as "listings" | "orders")} className="w-full text-left">
                <span className="text-[10px] font-semibold text-muted">{number}</span><h3 className="mt-8 text-sm font-semibold">{title}</h3><p className="mt-2 text-[11px] leading-5 text-muted">{body}</p>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Live checkouts", listings], ["Needs delivery", funded], ["Completed", settled], ["Volume paid", `$${((stats?.settledVolumeBaseUnits ?? 0) / 1_000_000).toFixed(2)}`]].map(([label, value]) => (
          <div key={label} className="flex min-h-28 flex-col rounded-2xl border border-border p-4"><span className="text-[9px] font-semibold tracking-[.08em] text-muted uppercase">{label}</span><strong className="mt-auto font-serif text-3xl font-normal tracking-[-.04em]">{value}</strong></div>
        ))}
      </section>

      <button onClick={() => onNavigate("automation")} className="text-left text-[12px] text-muted underline underline-offset-4">Set up webhooks and delivery automation</button>
    </div>
  );
}
