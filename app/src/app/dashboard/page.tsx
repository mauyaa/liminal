"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import ListingsPanel from "./_components/ListingsPanel";
import OrdersPanel from "./_components/OrdersPanel";
import SubscriptionsPanel from "./_components/SubscriptionsPanel";
import WebhookSettingsPanel from "./_components/WebhookSettingsPanel";
import OracleConfigPanel from "./_components/OracleConfigPanel";
import StatsHeader from "./_components/StatsHeader";

type Tab = "listings" | "orders" | "subscriptions" | "webhook" | "oracle";

const TABS: { id: Tab; label: string }[] = [
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "webhook", label: "Webhook" },
  { id: "oracle", label: "Oracle" },
];

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("listings");

  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Merchant Dashboard</h1>
          <WalletMultiButton />
        </div>

        {!publicKey ? (
          <p className="text-sm text-muted">Connect a devnet wallet to manage your store.</p>
        ) : (
          <>
            <StatsHeader />

            <nav className="flex gap-1 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "border-b-2 border-foreground text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === "listings" && <ListingsPanel />}
            {tab === "orders" && <OrdersPanel />}
            {tab === "subscriptions" && <SubscriptionsPanel />}
            {tab === "webhook" && <WebhookSettingsPanel />}
            {tab === "oracle" && <OracleConfigPanel />}
          </>
        )}
      </main>
    </div>
  );
}
