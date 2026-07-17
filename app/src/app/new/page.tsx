"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { Field, inputBase } from "../dashboard/_components/ui";

const DEADLINE_CHIPS = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

type CreateState = "idle" | "signing" | "sending" | "done" | "error";

/** Never lets a raw parse/network exception reach the UI as its own "error message." */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Translates raw JS/network exceptions into something a buyer or seller can actually act on. */
function friendlyCreateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Cancelled — nothing was created.";
  }
  if (lower.includes("unexpected") || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("json")) {
    return "Something went wrong creating your link. Please try again.";
  }
  return raw;
}

export default function NewLinkPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [title, setTitle] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [customHours, setCustomHours] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);

  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const effectiveHours = usingCustom ? parseFloat(customHours) : deadlineHours;
  const link = sku && typeof window !== "undefined" ? `${window.location.origin}/pay/${sku}` : "";

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!publicKey || !signTransaction) return;
      setError(null);
      try {
        const priceUsdc = Math.round(parseFloat(priceUsd) * 1_000_000);
        const deliveryWindowSeconds = Math.round(effectiveHours * 3600);
        if (!priceUsdc || priceUsdc <= 0) throw new Error("Enter a price greater than zero.");
        if (!deliveryWindowSeconds || deliveryWindowSeconds <= 0) throw new Error("Pick a delivery deadline.");

        setState("signing");
        const res = await fetch("/api/merchant/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantWallet: publicKey.toBase58(),
            title,
            priceUsdc,
            deliveryWindowSeconds,
          }),
        });
        const body = await safeJson(res);
        if (!res.ok || typeof body.transaction !== "string") {
          throw new Error(typeof body.message === "string" ? body.message : "Failed to create link. Please try again.");
        }

        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);

        setState("sending");
        let sig: string;
        if (typeof body.relaySubmitUrl === "string") {
          const relayRes = await fetch(body.relaySubmitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transaction: signed.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
            }),
          });
          const relayBody = await safeJson(relayRes);
          if (!relayRes.ok || typeof relayBody.signature !== "string") {
            throw new Error(typeof relayBody.message === "string" ? relayBody.message : "Failed to submit the transaction. Please try again.");
          }
          sig = relayBody.signature;
        } else {
          sig = await connection.sendRawTransaction(signed.serialize());
          await connection.confirmTransaction(sig, "confirmed");
        }

        setSku(body.sku as string);
        setState("done");
      } catch (err) {
        setError(friendlyCreateError(err));
        setState("error");
      }
    },
    [publicKey, signTransaction, connection, title, priceUsd, effectiveHours]
  );

  const busy = state === "signing" || state === "sending";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [link]);

  const shareText = `Pay me ${priceUsd || ""} USDC — protected by escrow, releases when I deliver: ${link}`;

  if (state === "done" && sku) {
    return (
      <div className="route-shell">
        <main className="route-main route-main--narrow">
          <div className="route-heading">
            <h1 className="route-title">Your link is live.</h1>
            <p className="route-lede">Share it anywhere. The buyer&apos;s money locks the moment they pay — nobody can touch it until you deliver.</p>
          </div>

          <div className="surface flex flex-col gap-4 p-6 sm:p-8">
            <p className="break-all font-mono text-lg font-medium">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-semibold text-white transition-opacity hover:opacity-85"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition-colors hover:bg-foreground/5"
              >
                WhatsApp
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition-colors hover:bg-foreground/5"
              >
                Telegram
              </a>
              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition-colors hover:bg-foreground/5"
              >
                X
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/pay/${sku}`} className="text-sm font-medium underline">Open the link</Link>
            <button
              onClick={() => {
                setState("idle");
                setSku(null);
                setTitle("");
                setPriceUsd("");
              }}
              className="text-sm font-medium text-muted underline"
            >
              Create another link
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="route-shell">
      <main className="route-main route-main--narrow">
        <div className="route-heading">
          <h1 className="route-title">Create your payment link.</h1>
          <p className="route-lede">Three fields, about 15 seconds. The link locks the buyer&apos;s money until you deliver — then it releases itself.</p>
        </div>

        {!publicKey && (
          <div className="surface flex flex-col items-start gap-4 p-6 sm:p-8">
            <p className="text-sm leading-6 text-muted">Connect a devnet wallet to create a link. You&apos;ll see the form below either way.</p>
            <WalletMultiButton />
          </div>
        )}

        <form onSubmit={handleSubmit} className="surface flex flex-col gap-6 p-6 sm:p-8">
          <fieldset disabled={!publicKey} className="flex flex-col gap-6 disabled:opacity-40">
            <Field label="What are you selling?">
              <input
                required
                placeholder="Logo design, 1 revision"
                className={inputBase}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label="Price (USDC)">
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="40.00"
                className={inputBase}
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
              />
            </Field>

            <Field label="Delivery deadline" hint="Buyer auto-refunds if you haven't delivered by this time.">
              <div className="flex flex-wrap gap-2">
                {DEADLINE_CHIPS.map((chip) => (
                  <button
                    key={chip.hours}
                    type="button"
                    onClick={() => {
                      setUsingCustom(false);
                      setDeadlineHours(chip.hours);
                    }}
                    className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors ${
                      !usingCustom && deadlineHours === chip.hours
                        ? "bg-foreground text-white"
                        : "border border-border hover:bg-foreground/5"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setUsingCustom(true)}
                  className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors ${
                    usingCustom ? "bg-foreground text-white" : "border border-border hover:bg-foreground/5"
                  }`}
                >
                  Custom
                </button>
                {usingCustom && (
                  <input
                    type="number"
                    min="1"
                    placeholder="hours"
                    className={`${inputBase} w-28`}
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                  />
                )}
              </div>
            </Field>

            <div className="flex flex-col items-start gap-3">
              <button
                type="submit"
                disabled={!publicKey || busy}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {state === "signing" ? "Confirm in your wallet…" : state === "sending" ? "Creating link…" : "Create link"}
              </button>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          </fieldset>
        </form>
      </main>
    </div>
  );
}
