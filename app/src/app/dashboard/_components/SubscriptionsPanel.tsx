"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { EmptyState, Field, FormSection, inputBase } from "./ui";

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
  const [creating, setCreating] = useState(false);
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

        setFormSuccess(
          `Plan live. Share your subscribe link: ${window.location.origin}/subscribe/${body.planId}`
        );
        setForm((f) => ({ ...f, title: "", description: "", imageUrl: "", priceUsd: "" }));
        setCreating(false);
        refreshPlans();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to create plan");
      } finally {
        setSubmitting(false);
      }
    },
    [publicKey, signTransaction, connection, form, refreshPlans]
  );

  const toggleExpand = useCallback(
    async (planId: string) => {
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
    },
    [expandedPlanId]
  );

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
        setCollectMessage(
          err instanceof Error ? err.message : "Nothing due yet — this period was already collected."
        );
      } finally {
        setCollectingWallet(null);
      }
    },
    [publicKey, signTransaction, connection]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-medium tracking-tight">
            Your plans {loadingPlans && <span className="font-normal text-muted">refreshing…</span>}
          </h2>
          <p className="text-[12px] text-muted">
            Collections run automatically — &quot;Collect&quot; is the manual override.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => {
              setFormSuccess(null);
              setCreating(true);
            }}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            New plan
          </button>
        )}
      </div>

      {formSuccess && (
        <p className="rounded-lg border border-border bg-foreground/[0.03] px-4 py-3 text-sm text-green-600 dark:text-green-400">
          {formSuccess}
        </p>
      )}

      {creating && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-8 rounded-xl border border-border p-5"
        >
          <FormSection title="Plan details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store name" hint="Shown to subscribers at checkout.">
                <input
                  required
                  placeholder="Aurora Prints"
                  className={inputBase}
                  value={form.storeName}
                  onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                />
              </Field>
              <Field label="Title">
                <input
                  required
                  placeholder="Supporter tier"
                  className={inputBase}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Description" hint="Optional — one sentence subscribers see under the title.">
              <input
                placeholder="Early access and a monthly sticker drop."
                className={inputBase}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label="Image URL">
              <input
                required
                placeholder="https://…/plan.png"
                className={inputBase}
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
            </Field>
          </FormSection>

          <FormSection title="Billing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price per period (USD)">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="4.99"
                  className={inputBase}
                  value={form.priceUsd}
                  onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
                />
              </Field>
              <Field label="Billing period">
                <select
                  className={inputBase}
                  value={form.periodHours}
                  onChange={(e) => setForm((f) => ({ ...f, periodHours: e.target.value }))}
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.hours} value={opt.hours}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Stablecoin mint" hint="Devnet demo token — leave as-is unless you know why.">
              <input
                required
                className={`${inputBase} font-mono text-xs`}
                value={form.mint}
                onChange={(e) => setForm((f) => ({ ...f, mint: e.target.value }))}
              />
            </Field>
          </FormSection>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {submitting ? "Confirm in your wallet…" : "Create plan"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}
        </form>
      )}

      {!creating &&
        (plans.length === 0 ? (
          <EmptyState message="No plans yet. Recurring revenue takes about a minute to set up." />
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li key={p.planId} className="rounded-lg border border-border">
                <button
                  onClick={() => toggleExpand(p.planId)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{p.title}</span>
                    <span className="truncate text-[12px] text-muted">
                      ${(p.amountBaseUnits / 1_000_000).toFixed(2)} / {periodLabel(p.periodHours)}
                    </span>
                  </div>
                  <span className="shrink-0 text-[12px] text-muted">
                    {expandedPlanId === p.planId ? "Hide" : "Subscribers"}
                  </span>
                </button>

                {expandedPlanId === p.planId && (
                  <div className="flex flex-col gap-2 border-t border-border px-3 py-3 pl-16">
                    {loadingSubscribers ? (
                      <p className="text-[13px] text-muted">Loading subscribers…</p>
                    ) : subscribers.length === 0 ? (
                      <p className="text-[13px] text-muted">
                        No subscribers yet. Share /subscribe/{p.planId} to get your first.
                      </p>
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
                    {collectMessage && <p className="text-[13px] text-muted">{collectMessage}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
