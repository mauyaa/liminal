"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";

interface ActionLink {
  label: string;
  href: string;
}

interface Listing {
  title: string;
  description: string;
  icon: string;
  label: string;
  deliveryWindowSeconds?: number;
  links?: { actions: ActionLink[] };
}

type PayState = "idle" | "signing" | "sending" | "confirmed" | "error";

function windowLabel(seconds?: number): string {
  if (!seconds || seconds <= 0) return "the delivery window";
  const hours = Math.round(seconds / 3600);
  if (hours < 1) return `${Math.round(seconds / 60)} minutes`;
  if (hours % 24 === 0) return hours === 24 ? "24 hours" : `${hours / 24} days`;
  return `${hours} hours`;
}

/** Map raw wallet/API failures to guide-voice copy; raw detail stays as fine print. */
function friendlyPayError(raw: string): { headline: string; detail?: string } {
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return { headline: "No problem — nothing was charged. Ready when you are." };
  }
  if (lower.includes("insufficient") || lower.includes('"custom":1')) {
    return {
      headline: "Your wallet doesn't have enough of this token. Top up and try again.",
      detail: raw,
    };
  }
  return {
    headline: "That didn't go through — nothing was charged. Try again in a moment.",
    detail: raw,
  };
}

export default function BuyPage() {
  const { sku } = useParams<{ sku: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gasless, setGasless] = useState(false);
  const [payState, setPayState] = useState<PayState>("idle");
  const [payError, setPayError] = useState<{ headline: string; detail?: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [orderPda, setOrderPda] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/actions/buy/${sku}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to load listing");
        setListing(body);
      })
      .catch((err) => setLoadError(err.message));
  }, [sku]);

  const normalAction = listing?.links?.actions?.[0];
  const sponsoredAction = listing?.links?.actions?.[1];
  const checkoutStep = payState === "confirmed" ? 3 : publicKey ? 2 : 1;

  const handlePay = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setPayError(null);
    setPayState("signing");
    try {
      const href = gasless && sponsoredAction ? sponsoredAction.href : `/api/actions/buy/${sku}`;
      const res = await fetch(href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to build transaction");

      const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
      const signed = await signTransaction(tx);

      let sig: string;
      if (gasless && body.relaySubmitUrl) {
        // The relayer, not the buyer, is fee payer here - the buyer's
        // signature is only a partial one, so the relayer's own submit
        // route countersigns and broadcasts it, not this client.
        setPayState("sending");
        const relayRes = await fetch(body.relaySubmitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction: signed
              .serialize({ requireAllSignatures: false, verifySignatures: false })
              .toString("base64"),
          }),
        });
        const relayBody = await relayRes.json();
        if (!relayRes.ok) throw new Error(relayBody.message ?? "Failed to submit sponsored transaction");
        sig = relayBody.signature;
      } else {
        setPayState("sending");
        sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");
      }

      await fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderPda: body.orderPda, fundTxSignature: sig }),
      }).catch(() => {});

      setSignature(sig);
      setOrderPda(body.orderPda ?? null);
      setPayState("confirmed");
    } catch (err) {
      setPayError(friendlyPayError(err instanceof Error ? err.message : "Payment failed"));
      setPayState("error");
    }
  }, [publicKey, signTransaction, connection, sku, gasless, sponsoredAction]);

  return (
    <div className="route-shell">
      <main className="route-main">
        {loadError && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
        {!listing && !loadError && <p className="route-lede">Loading protected checkout…</p>}

        {listing && <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr]">
          <section className="overflow-hidden rounded-[36px] border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.icon} alt={listing.title} className="aspect-[4/3] w-full object-cover" />
            <div className="p-7 sm:p-10">
              <h1 className="mt-6 font-serif text-5xl leading-[.95] tracking-[-.05em] sm:text-7xl">{listing.title}</h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-muted">{listing.description}</p>
            </div>
          </section>

          <section className="flex flex-col rounded-[36px] bg-[#ded8ce] p-7 sm:p-10">
            <ol className="grid grid-cols-3 gap-2" aria-label="Checkout progress">
              {["Review", "Approve", "Track"].map((label, index) => {
                const step = index + 1;
                return <li key={label} className={`border-t pt-3 text-[11px] ${step <= checkoutStep ? "border-foreground font-semibold text-foreground" : "border-foreground/20 text-muted"}`}><span className="mr-1.5">{step}</span>{label}</li>;
              })}
            </ol>
            <div className="mt-12 border-b border-foreground/20 pb-8">
              <h2 className="font-serif text-4xl leading-[.95] tracking-[-.045em] sm:text-5xl">Seller paid only after delivery.</h2>
              <p className="mt-5 text-[13px] leading-6 text-muted">Not delivered within {windowLabel(listing.deliveryWindowSeconds)}? Your payment returns automatically.</p>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              <WalletMultiButton />
              {!publicKey && (
                <p className="text-[12px] leading-5 text-muted">Connect the wallet you want to pay with. No account, no password, and Liminal never holds your keys.</p>
              )}

              {sponsoredAction && payState !== "confirmed" && publicKey && (
                <label className="rounded-xl border border-foreground/15 bg-white/30 p-4 text-sm">
                  <span className="flex items-center gap-3 font-medium">
                    <input
                      type="checkbox"
                      checked={gasless}
                      onChange={(e) => setGasless(e.target.checked)}
                    />
                    Pay network fees for me (no SOL needed)
                  </span>
                  <span className="mt-1 block pl-6 text-[11px] leading-4 text-muted">
                    A relayer covers the network fee for a flat $0.01, added to your total.
                  </span>
                </label>
              )}

              {publicKey && payState !== "confirmed" && (
                <button
                  onClick={handlePay}
                  disabled={payState === "signing" || payState === "sending"}
                  className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {payState === "signing"
                    ? "Confirm in your wallet…"
                    : payState === "sending"
                      ? "Sending…"
                      : gasless && sponsoredAction
                        ? sponsoredAction.label
                        : (normalAction?.label ?? listing.label)}
                </button>
              )}

              {payState === "confirmed" && signature && (
                <div className="rounded-2xl bg-foreground p-6 text-sm text-white">
                  <p className="font-serif text-3xl tracking-[-.04em] text-accent">Payment protected.</p>
                  <p className="mt-3 leading-6 text-white/60">
                    Your payment is in escrow — the seller has been notified to deliver. Confirm
                    receipt when it arrives, or do nothing and get refunded automatically after
                    the delivery window.
                  </p>
                  {orderPda && (
                    <Link
                      href={`/orders/${orderPda}`}
                      className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-foreground"
                    >
                      Track this order
                    </Link>
                  )}
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block font-mono text-[10px] text-white/50 underline"
                  >
                    View transaction
                  </a>
                </div>
              )}

              {payError && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-red-700">{payError.headline}</p>
                  {payError.detail && (
                    <p className="break-all text-[11px] text-muted">{payError.detail}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>}
      </main>
    </div>
  );
}
