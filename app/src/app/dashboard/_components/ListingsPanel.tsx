"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { inputClass, MERCHANT_STATUS } from "./shared";

interface Listing {
  sku: string;
  title: string;
  imageUrl: string;
  priceUsdc: number;
  mint: string;
  deliveryWindowSeconds: number;
  orderPda: string | null;
  escrowStatus: string | null;
  buyerWallet: string | null;
}

const DEFAULT_MINT = "AUMiaz7S6rxn2E36tSpFyNcQwfZ5FroeesU4XMHngpNZ"; // devnet demo mint

export default function ListingsPanel() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  const [form, setForm] = useState({
    storeName: "",
    sku: "",
    title: "",
    description: "",
    imageUrl: "",
    priceUsd: "",
    mint: DEFAULT_MINT,
    deliveryWindowHours: "24",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const refreshListings = useCallback(async () => {
    if (!publicKey) return;
    setLoadingListings(true);
    try {
      const res = await fetch(
        `/api/merchant/listings?merchantWallet=${publicKey.toBase58()}`
      );
      const body = await res.json();
      setListings(body.listings ?? []);
    } finally {
      setLoadingListings(false);
    }
  }, [publicKey]);

  useEffect(() => {
    // Genuine fetch-on-mount/wallet-change, not state derivable at render time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshListings();
  }, [refreshListings]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!publicKey || !signTransaction) return;
      setFormError(null);
      setFormSuccess(null);
      setSubmitting(true);
      try {
        const priceUsdc = Math.round(parseFloat(form.priceUsd) * 1_000_000);
        const deliveryWindowSeconds = Math.round(parseFloat(form.deliveryWindowHours) * 3600);
        if (!priceUsdc || priceUsdc <= 0) throw new Error("Enter a valid price");
        if (!deliveryWindowSeconds || deliveryWindowSeconds <= 0)
          throw new Error("Enter a valid delivery window");

        const res = await fetch("/api/merchant/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantWallet: publicKey.toBase58(),
            storeName: form.storeName,
            sku: form.sku,
            title: form.title,
            description: form.description || undefined,
            imageUrl: form.imageUrl,
            priceUsdc,
            mint: form.mint,
            deliveryWindowSeconds,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to create listing");

        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        setFormSuccess(
          `Listing live. Share your checkout link: ${window.location.origin}/buy/${form.sku} — or embed it on any site from /embed.`
        );
        setForm((f) => ({ ...f, sku: "", title: "", description: "", imageUrl: "", priceUsd: "" }));
        refreshListings();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to create listing");
      } finally {
        setSubmitting(false);
      }
    },
    [publicKey, signTransaction, connection, form, refreshListings]
  );

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-b border-border pb-10">
        <h2 className="text-sm font-medium tracking-tight">New listing</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Store name"
            className={inputClass}
            value={form.storeName}
            onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <input
              required
              placeholder="SKU (unique)"
              className={inputClass}
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            />
            <span className="text-[11px] leading-4 text-muted">
              Becomes your checkout link: /buy/your-sku
            </span>
          </div>
          <input
            required
            placeholder="Title"
            className={`${inputClass} col-span-2`}
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
            placeholder="Price (USD)"
            className={inputClass}
            value={form.priceUsd}
            onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <input
              required
              type="number"
              step="1"
              min="1"
              placeholder="Delivery window (hours)"
              className={inputClass}
              value={form.deliveryWindowHours}
              onChange={(e) => setForm((f) => ({ ...f, deliveryWindowHours: e.target.value }))}
            />
            <span className="text-[11px] leading-4 text-muted">
              Your delivery promise — buyers auto-refund if unconfirmed past this.
            </span>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <input
              required
              placeholder="Stablecoin mint address"
              className={`${inputClass} font-mono text-xs`}
              value={form.mint}
              onChange={(e) => setForm((f) => ({ ...f, mint: e.target.value }))}
            />
            <span className="text-[11px] leading-4 text-muted">
              Devnet demo token — leave as-is unless you know why.
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create listing"}
        </button>

        {formError && <p className="text-sm text-red-500">{formError}</p>}
        {formSuccess && <p className="text-sm text-green-600 dark:text-green-400">{formSuccess}</p>}
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight">
          Your listings {loadingListings && <span className="text-muted">(refreshing…)</span>}
        </h2>
        {listings.length === 0 ? (
          <p className="text-sm text-muted">No listings yet. Your first one takes about a minute.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {listings.map((l) => (
              <li
                key={l.sku}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <Link href={`/buy/${l.sku}`} className="font-medium underline">
                    {l.title}
                  </Link>
                  <span className="text-muted">
                    {l.sku} · ${(l.priceUsdc / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] tracking-wide text-muted">
                  {MERCHANT_STATUS[l.escrowStatus ?? ""] ?? l.escrowStatus ?? "Unknown"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
