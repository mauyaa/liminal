"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Field, inputBase } from "../../dashboard/_components/ui";

interface EvidenceItem {
  submittedBy: "buyer" | "seller";
  content: string;
  createdAt: string;
}

interface DisputeRow {
  orderPda: string;
  openedAt: string;
  title: string;
  priceUsdc: number;
  buyerWallet: string | null;
  sellerWallet: string;
  evidence: EvidenceItem[];
}

const SESSION_KEY = "liminal-admin-secret";

/** Quick split presets - the operator can still type an exact number below. */
const SPLIT_PRESETS = [
  { label: "Full refund", bps: 0 },
  { label: "50 / 50", bps: 5000 },
  { label: "Full settle", bps: 10000 },
];

function DisputeCard({ dispute, secret, onResolved }: { dispute: DisputeRow; secret: string; onResolved: () => void }) {
  const [sellerBps, setSellerBps] = useState(5000);
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    if (!reasoning.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${dispute.orderPda}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ sellerBps, reasoning: reasoning.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to resolve");
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve");
    } finally {
      setSubmitting(false);
    }
  }, [dispute.orderPda, sellerBps, reasoning, secret, onResolved]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href={`/orders/${dispute.orderPda}`} className="font-medium hover:underline" target="_blank">
            {dispute.title}
          </Link>
          <p className="text-[12px] text-muted">
            ${(dispute.priceUsdc / 1_000_000).toFixed(2)} · opened {new Date(dispute.openedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-2 text-[11px] text-muted sm:grid-cols-2">
        <span>Buyer: {dispute.buyerWallet ?? "unknown"}</span>
        <span>Seller: {dispute.sellerWallet}</span>
      </div>

      <div className="flex flex-col gap-2">
        {dispute.evidence.length === 0 ? (
          <p className="text-[12px] text-muted">No statements submitted yet.</p>
        ) : (
          dispute.evidence.map((item, i) => (
            <div key={i} className="rounded-xl bg-foreground/[.035] p-3 text-[12px] leading-5">
              <span className="font-semibold">{item.submittedBy === "buyer" ? "Buyer" : "Seller"}:</span>{" "}
              <span className="whitespace-pre-wrap text-muted">{item.content}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[.035] p-4">
        <div className="flex flex-wrap gap-2">
          {SPLIT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setSellerBps(preset.bps)}
              className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium transition-colors ${
                sellerBps === preset.bps ? "bg-foreground text-background" : "border border-border hover:bg-foreground/5"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs text-muted">
            seller %
            <input
              type="number"
              min={0}
              max={100}
              value={sellerBps / 100}
              onChange={(e) => setSellerBps(Math.max(0, Math.min(100, Number(e.target.value) || 0)) * 100)}
              className={`${inputBase} h-9 w-20`}
            />
          </label>
        </div>

        <Field label="Reasoning" hint="Published as the verdict - both parties will see this.">
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-foreground/40"
          />
        </Field>

        <button
          onClick={resolve}
          disabled={submitting || !reasoning.trim()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-background disabled:opacity-50"
        >
          {submitting ? "Resolving…" : `Resolve: ${sellerBps / 100}% seller / ${100 - sellerBps / 100}% buyer`}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export default function AdminDisputesPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Genuine one-time read of a value that can only live in sessionStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecret(sessionStorage.getItem(SESSION_KEY));
  }, []);

  const load = useCallback(async (s: string) => {
    setError(null);
    const res = await fetch("/api/admin/disputes", { headers: { Authorization: `Bearer ${s}` } });
    if (res.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      setSecret(null);
      setError("Incorrect secret.");
      return;
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "Failed to load disputes");
    setDisputes(body.disputes ?? []);
  }, []);

  useEffect(() => {
    // Genuine fetch-on-mount/secret-change, matching the order page's own convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (secret) load(secret).catch((err) => setError(err.message));
  }, [secret, load]);

  if (!secret) {
    return (
      <div className="route-shell">
        <main className="route-main route-main--narrow">
          <div className="route-heading">
            <h1 className="route-title">Dispute resolution.</h1>
            <p className="route-lede">Operator-only. Enter the admin secret to continue.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem(SESSION_KEY, secretInput);
              setSecret(secretInput);
            }}
            className="surface flex flex-col gap-4 p-6"
          >
            <input
              type="password"
              placeholder="Admin secret"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              className={inputBase}
            />
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-background">
              Continue
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="route-shell">
      <main className="route-main">
        <div className="route-heading">
          <h1 className="route-title">Dispute resolution.</h1>
          <p className="route-lede">{disputes?.length ?? 0} open dispute{disputes?.length === 1 ? "" : "s"}.</p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {disputes?.length === 0 && <p className="text-sm text-muted">Nothing open right now.</p>}
        <div className="flex flex-col gap-4">
          {disputes?.map((d) => (
            <DisputeCard key={d.orderPda} dispute={d} secret={secret} onResolved={() => load(secret)} />
          ))}
        </div>
      </main>
    </div>
  );
}
