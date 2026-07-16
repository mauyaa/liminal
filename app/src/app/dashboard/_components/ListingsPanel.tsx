"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { EmptyState, Field, FormSection, StatusChip, inputBase } from "./ui";

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
  const [creating, setCreating] = useState(false);

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

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!importUrl) return;
    setImporting(true);
    setImportNote(null);
    try {
      const res = await fetch("/api/merchant/import-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Import failed");

      setForm((f) => ({
        ...f,
        title: body.title ?? f.title,
        description: body.description ?? f.description,
        imageUrl: body.imageUrl ?? f.imageUrl,
        priceUsd: body.priceUsd != null ? String(body.priceUsd) : f.priceUsd,
        storeName: body.storeName ?? f.storeName,
        sku:
          f.sku ||
          (body.title ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40),
      }));
      setImportNote("Imported — review the details below, then publish.");
    } catch (err) {
      setImportNote(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [importUrl]);

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
          `Listing live. Share your checkout link: ${window.location.origin}/buy/${form.sku}`
        );
        setForm((f) => ({ ...f, sku: "", title: "", description: "", imageUrl: "", priceUsd: "" }));
        setCreating(false);
        refreshListings();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to create listing");
      } finally {
        setSubmitting(false);
      }
    },
    [publicKey, signTransaction, connection, form, refreshListings]
  );

  const newListingButton = (
    <button
      onClick={() => {
        setFormSuccess(null);
        setCreating(true);
      }}
      className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
    >
      New listing
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium tracking-tight">
          Your listings{" "}
          {loadingListings && <span className="font-normal text-muted">refreshing…</span>}
        </h2>
        {!creating && newListingButton}
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
          <Field
            label="Import from a store URL"
            hint="Already sell this somewhere? Paste the product page — Shopify, WooCommerce, most stores work — and we'll fill the form from its own product data."
          >
            <div className="flex gap-3">
              <input
                type="url"
                placeholder="https://yourstore.com/products/sticker-pack"
                className={`${inputBase} flex-1`}
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !importUrl}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </Field>
          {importNote && (
            <p className="-mt-4 text-[13px] text-muted" role="status">
              {importNote}
            </p>
          )}

          <FormSection title="What you're selling">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store name" hint="Shown to buyers at checkout.">
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
                  placeholder="Sticker pack — series one"
                  className={inputBase}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Description" hint="Optional — one sentence buyers see under the title.">
              <input
                placeholder="Ten holographic stickers, shipped worldwide."
                className={inputBase}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" hint={`Becomes your checkout link: /buy/${form.sku || "your-sku"}`}>
                <input
                  required
                  placeholder="sticker-pack-01"
                  className={inputBase}
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                />
              </Field>
              <Field label="Image URL">
                <input
                  required
                  placeholder="https://…/product.png"
                  className={inputBase}
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Price & delivery">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (USD)">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="19.99"
                  className={inputBase}
                  value={form.priceUsd}
                  onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
                />
              </Field>
              <Field
                label="Delivery window (hours)"
                hint="Your delivery promise — buyers auto-refund if unconfirmed past this."
              >
                <input
                  required
                  type="number"
                  step="1"
                  min="1"
                  placeholder="24"
                  className={inputBase}
                  value={form.deliveryWindowHours}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryWindowHours: e.target.value }))}
                />
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
              {submitting ? "Confirm in your wallet…" : "Create listing"}
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
        (listings.length === 0 ? (
          <EmptyState message="No listings yet. Your first one takes about a minute." />
        ) : (
          <ul className="flex flex-col gap-2">
            {listings.map((l) => (
              <li
                key={l.sku}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`/buy/${l.sku}`} className="truncate text-sm font-medium hover:underline">
                    {l.title}
                  </Link>
                  <span className="truncate text-[12px] text-muted">
                    {l.sku} · ${(l.priceUsdc / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <StatusChip status={l.escrowStatus} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
