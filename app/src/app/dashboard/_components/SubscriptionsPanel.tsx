"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { inputClass } from "./shared";

interface Plan {
  planId: string;
  planPda: string;
  title: string;
  description: string | null;
  imageUrl: string;
  amountBaseUnits: number;
  periodHours: number;
  mint: string;
}

interface Subscriber {
  subscriberWallet: string;
  subscriptionPda: string;
}

const DEFAULT_MINT = "AUMiaz7S6rxn2E36tSpFyNcQwfZ5FroeesU4XMHngpNZ"; // devnet demo mint

const PERIOD_OPTIONS = [
  { label: "Daily", hours: 24 },
  { label: "Weekly", hours: 24 * 7 },
  { label: "Monthly (30d)", hours: 24 * 30 },
];

function periodLabel(periodHours: number): string {
  if (periodHours % (24 * 30) === 0) return `${periodHours / (24 * 30)}mo`;
  if (periodHours % 24 === 0) return `${periodHours / 24}d`;
  return `${periodHours}h`;
}

export default function SubscriptionsPanel() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [collectingWallet, setCollectingWallet] = useState<string | null>(null);
  const [collectMessage, setCollectMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    storeName: "",
    title: "",
    description: "",
    imageUrl: "",
    priceUsd: "",
    periodHours: PERIOD_OPTIONS[0].hours.toString(),
    mint: DEFAULT_MINT,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const refreshPlans = useCallback(async () => {
    if (!publicKey) return;
    setLoadingPlans(true);
    try {
      const res = await fetch(`/api/merchant/plans?merchantWallet=${publicKey.toBase58()}`);
      const body = await res.json();
      setPlans(body.plans ?? []);
    } finally {
      setLoadingPlans(false);
    }
  }, [publicKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPlans();
  }, [refreshPlans]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!publicKey || !signTransaction) return;
      setFormError(null);
      setFormSuccess(null);
      setSubmitting(true);
      try {
        const amountBaseUnits = Math.round(parseFloat(form.priceUsd) * 1_000_000);
        if (!amountBaseUnits || amountBaseUnits <= 0) throw new Error("Enter a valid price");

        const res = await fetch("/api/merchant/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantWallet: publicKey.toBase58(),
            storeName: form.storeName,
            title: form.title,
            description: form.description || undefined,
            imageUrl: form.imageUrl,
            amountBaseUnits,
            periodHours: parseInt(form.periodHours, 10),
            mint: form.mint,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to create plan");

        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        setFormSuccess(`Plan "${form.title}" created and confirmed on-chain.`);
        setForm((f) => ({ ...f, title: "", description: "", imageUrl: "", priceUsd: "" }));
        refreshPlans();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to create plan");
      } finally {
        setSubmitting(false);
      }
    },
    [publicKey, signTransaction, connection, form, refreshPlans]
  );

  const toggleExpand = useCallback(async (planId: string) => {
    setCollectMessage(null);
    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(planId);
    setLoadingSubscribers(true);
    try {
      const res = await fetch(`/api/merchant/plans/${planId}/subscribers`);
      const body = await res.json();
      setSubscribers(body.subscribers ?? []);
    } finally {
      setLoadingSubscribers(false);
    }
  }, [expandedPlanId]);

  const handleCollect = useCallback(
    async (planId: string, subscriberWallet: string) => {
      if (!publicKey || !signTransaction) return;
      setCollectMessage(null);
      setCollectingWallet(subscriberWallet);
      try {
        const res = await fetch(`/api/merchant/plans/${planId}/collect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caller: publicKey.toBase58(), subscriber: subscriberWallet }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to collect");

        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        setCollectMessage(`Collected from ${subscriberWallet.slice(0, 4)}..${subscriberWallet.slice(-4)}.`);
      } catch (err) {
        setCollectMessage(err instanceof Error ? err.message : "Collect failed - not yet due, or already collected this period.");
      } finally {
        setCollectingWallet(null);
      }
    },
    [publicKey, signTransaction, connection]
  );

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-b border-border pb-10">
        <h2 className="text-sm font-medium tracking-tight">New subscription plan</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Store name"
            className={inputClass}
            value={form.storeName}
            onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
          />
          <input
            required
            placeholder="Title"
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            placeholder="Description (optional)"
            className={`${inputClass} col-span-2`}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <input
            required
            placeholder="Image URL"
            className={`${inputClass} col-span-2`}
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          />
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Price per period (USD)"
            className={inputClass}
            value={form.priceUsd}
            onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
          />
          <select
            className={inputClass}
            value={form.periodHours}
            onChange={(e) => setForm((f) => ({ ...f, periodHours: e.target.value }))}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.hours} value={opt.hours}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Stablecoin mint address"
            className={`${inputClass} col-span-2 font-mono text-xs`}
            value={form.mint}
            onChange={(e) => setForm((f) => ({ ...f, mint: e.target.value }))}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create plan"}
        </button>

        {formError && <p className="text-sm text-red-500">{formError}</p>}
        {formSuccess && <p className="text-sm text-green-600 dark:text-green-400">{formSuccess}</p>}
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight">
          Your plans {loadingPlans && <span className="text-muted">(refreshing…)</span>}
        </h2>
        <p className="text-[13px] text-muted">
          Collections also run automatically — &quot;Collect&quot; is the manual override, not a
          chore.
        </p>
        {plans.length === 0 ? (
          <p className="text-sm text-muted">No plans yet. Recurring revenue takes about a minute to set up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li key={p.planId} className="rounded-lg border border-border text-sm">
                <button
                  onClick={() => toggleExpand(p.planId)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-muted">
                      ${(p.amountBaseUnits / 1_000_000).toFixed(2)} / {periodLabel(p.periodHours)}
                    </span>
                  </div>
                  <span className="text-muted">{expandedPlanId === p.planId ? "Hide" : "Subscribers"}</span>
                </button>

                {expandedPlanId === p.planId && (
                  <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                    {loadingSubscribers ? (
                      <p className="text-muted">Loading subscribers…</p>
                    ) : subscribers.length === 0 ? (
                      <p className="text-muted">No subscribers yet.</p>
                    ) : (
                      subscribers.map((s) => (
                        <div key={s.subscriberWallet} className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-muted">
                            {s.subscriberWallet.slice(0, 4)}..{s.subscriberWallet.slice(-4)}
                          </span>
                          <button
                            onClick={() => handleCollect(p.planId, s.subscriberWallet)}
                            disabled={collectingWallet === s.subscriberWallet}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-border px-4 text-xs font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
                          >
                            {collectingWallet === s.subscriberWallet ? "Collecting…" : "Collect"}
                          </button>
                        </div>
                      ))
                    )}
                    {collectMessage && <p className="text-muted">{collectMessage}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
