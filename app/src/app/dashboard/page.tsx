"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import ListingsPanel from "./_components/ListingsPanel";
import OrdersPanel from "./_components/OrdersPanel";
import SubscriptionsPanel from "./_components/SubscriptionsPanel";
import WebhookSettingsPanel from "./_components/WebhookSettingsPanel";
import OracleConfigPanel from "./_components/OracleConfigPanel";
import DashboardHome from "./_components/DashboardHome";

type Tab = "home" | "listings" | "orders" | "subscriptions" | "automation";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "listings", label: "Checkout links" },
  { id: "orders", label: "Orders" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "automation", label: "Automation" },
];

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="route-shell">
      <main className="route-main">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="route-heading"><h1 className="route-title">Run your store.</h1><p className="route-lede">Create protected checkout links, know what needs delivery, and automate the rest.</p></div>
          <WalletMultiButton />
        </div>

        {!publicKey ? (
          <div className="surface p-8 sm:p-12"><h2 className="font-serif text-3xl tracking-[-.04em]">Connect a devnet wallet to begin.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-muted">No setup wizard and no account to create. Your wallet is the authority for your store.</p></div>
        ) : (
          <>
            <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-foreground/[.055] p-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
                    tab === t.id
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <section className="surface p-5 sm:p-8">{tab === "home" && <DashboardHome onNavigate={setTab} />}
            {tab === "listings" && <ListingsPanel />}
            {tab === "orders" && <OrdersPanel />}
            {tab === "subscriptions" && <SubscriptionsPanel />}
            {tab === "automation" && <div className="flex flex-col gap-10"><div><h2 className="font-serif text-3xl tracking-[-.04em]">Automate after the core flow works.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Webhooks notify your store when money moves. Delivery attestations can release funds without asking the buyer to return.</p></div><WebhookSettingsPanel /><OracleConfigPanel /></div>}</section>
          </>
        )}
      </main>
    </div>
  );
}
