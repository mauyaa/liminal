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
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <main className="flex w-full max-w-sm flex-col gap-6">
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {listing && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.icon}
              alt={listing.title}
              className="aspect-square w-full rounded-xl border border-border object-cover"
            />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">{listing.title}</h1>
              <p className="text-sm leading-6 text-muted">{listing.description}</p>
            </div>

            <div className="rounded-lg border border-border bg-foreground/[0.03] px-4 py-3">
              <p className="text-[13px] leading-5 text-muted">
                <span className="font-medium text-foreground">🔒 Protected purchase</span> — the
                seller is paid only when you confirm delivery. Not delivered within{" "}
                {windowLabel(listing.deliveryWindowSeconds)}? You&apos;re refunded automatically.
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <WalletMultiButton />
              {!publicKey && (
                <p className="text-[13px] text-muted">
                  You approve the payment in your own wallet. Liminal never holds your keys — no
                  sign-up, your wallet is your account.
                </p>
              )}

              {sponsoredAction && payState !== "confirmed" && publicKey && (
                <label className="flex flex-col gap-0.5 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={gasless}
                      onChange={(e) => setGasless(e.target.checked)}
                    />
                    Pay network fees for me (no SOL needed)
                  </span>
                  <span className="pl-5 text-[12px] text-muted">
                    A relayer covers the network fee for a flat $0.01, added to your total.
                  </span>
                </label>
              )}

              {publicKey && payState !== "confirmed" && (
                <button
                  onClick={handlePay}
                  disabled={payState === "signing" || payState === "sending"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
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
                <div className="flex flex-col gap-2 text-sm">
                  <p className="font-medium text-green-600 dark:text-green-400">
                    Payment protected.
                  </p>
                  <p className="text-muted">
                    Your payment is in escrow — the seller has been notified to deliver. Confirm
                    receipt when it arrives, or do nothing and get refunded automatically after
                    the delivery window.
                  </p>
                  {orderPda && (
                    <Link
                      href={`/orders/${orderPda}`}
                      className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
                    >
                      Track this order
                    </Link>
                  )}
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-muted underline"
                  >
                    View transaction
                  </a>
                </div>
              )}

              {payError && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-red-500">{payError.headline}</p>
                  {payError.detail && (
                    <p className="break-all text-[11px] text-muted">{payError.detail}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
