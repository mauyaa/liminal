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
  links?: { actions: ActionLink[] };
}

type PayState = "idle" | "signing" | "sending" | "confirmed" | "error";

export default function BuyPage() {
  const { sku } = useParams<{ sku: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gasless, setGasless] = useState(false);
  const [payState, setPayState] = useState<PayState>("idle");
  const [payError, setPayError] = useState<string | null>(null);
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
      setPayError(err instanceof Error ? err.message : "Payment failed");
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

            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <WalletMultiButton />

              {sponsoredAction && payState !== "confirmed" && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={gasless}
                    onChange={(e) => setGasless(e.target.checked)}
                  />
                  Pay gas fees for me (no SOL needed)
                </label>
              )}

              {publicKey && payState !== "confirmed" && (
                <button
                  onClick={handlePay}
                  disabled={payState === "signing" || payState === "sending"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {payState === "signing"
                    ? "Confirm in wallet…"
                    : payState === "sending"
                      ? "Sending…"
                      : gasless && sponsoredAction
                        ? sponsoredAction.label
                        : (normalAction?.label ?? listing.label)}
                </button>
              )}

              {payState === "confirmed" && signature && (
                <div className="flex flex-col gap-2 text-sm">
                  <p className="text-green-600 dark:text-green-400">
                    Escrow funded. Refundable automatically if unconfirmed after the
                    delivery window.
                  </p>
                  {orderPda && (
                    <Link
                      href={`/orders/${orderPda}`}
                      className="inline-flex h-10 w-fit items-center justify-center rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-foreground/5"
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

              {payError && <p className="text-sm text-red-500">{payError}</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
