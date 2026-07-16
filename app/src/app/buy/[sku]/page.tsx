"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";

interface ActionLink { label: string; href: string; }
interface Listing {
  title: string;
  description: string;
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

function friendlyPayError(raw: string): { headline: string; detail?: string } {
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return { headline: "Nothing was charged. You can try again when ready." };
  }
  if (lower.includes("insufficient") || lower.includes('"custom":1')) {
    return { headline: "This wallet does not have enough of the demo token.", detail: raw };
  }
  return { headline: "The payment did not go through. Nothing was charged.", detail: raw };
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
        if (!res.ok) throw new Error(body.message ?? "Failed to load checkout");
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
        setPayState("sending");
        const relayRes = await fetch(body.relaySubmitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction: signed.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
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
      <main className="route-main max-w-[1040px]">
        {loadError && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
        {!listing && !loadError && <p className="route-lede">Loading checkout…</p>}

        {listing && <>
          <header className="flex items-center justify-center gap-3">
            <span className="block h-11 w-11 overflow-hidden rounded-[13px]"><Image src="/liminal-mark.jpg" alt="" width={44} height={44} /></span>
            <div><p className="text-sm font-semibold tracking-[-.02em]">Liminal</p><p className="text-[11px] text-muted">Protected checkout</p></div>
          </header>

          <section className="overflow-hidden rounded-[32px] border border-border bg-surface shadow-[0_28px_70px_rgba(21,21,21,.07)]">
            <ol className="grid grid-cols-3 border-b border-border px-6 sm:px-10" aria-label="Checkout progress">
              {["Review terms", "Approve payment", "Track order"].map((label, index) => {
                const step = index + 1;
                return <li key={label} className={`border-b-2 py-5 text-center text-[11px] ${step <= checkoutStep ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted"}`}>{step}. {label}</li>;
              })}
            </ol>

            <div className="grid lg:grid-cols-[1.08fr_.92fr]">
              <div className="p-7 sm:p-11 lg:border-r lg:border-border">
                <p className="text-[11px] font-semibold text-muted">You’re paying for</p>
                <h1 className="mt-5 max-w-xl font-serif text-3xl leading-[1] tracking-[-.045em] sm:text-4xl">{listing.title}</h1>
                <p className="mt-5 max-w-lg text-sm leading-6 text-muted">{listing.description}</p>
                <div className="mt-12 flex items-end justify-between border-b border-border pb-7">
                  <strong className="font-serif text-4xl font-normal leading-none tracking-[-.05em]">{(normalAction?.label ?? listing.label).replace("Buy for ", "")}</strong>
                  <span className="pb-1 text-xs font-semibold">USDC</span>
                </div>
                <dl className="mt-5 text-[12px]">
                  <div className="flex justify-between gap-6 py-3"><dt className="text-muted">Payment destination</dt><dd className="font-semibold">Program escrow</dd></div>
                  <div className="flex justify-between gap-6 py-3"><dt className="text-muted">Seller receives funds</dt><dd className="font-semibold">After you confirm</dd></div>
                  <div className="flex justify-between gap-6 py-3"><dt className="text-muted">If delivery is unconfirmed</dt><dd className="font-semibold">Refundable after {windowLabel(listing.deliveryWindowSeconds)}</dd></div>
                  <div className="flex justify-between gap-6 py-3"><dt className="text-muted">Liminal fee</dt><dd className="font-semibold">$0.00</dd></div>
                </dl>
              </div>

              <div className="flex flex-col bg-[#ded8ce] p-7 sm:p-10">
                <h2 className="font-serif text-3xl leading-[1] tracking-[-.04em]">{publicKey ? "Approve the escrow payment." : "Connect your paying wallet."}</h2>
                <p className="mt-4 text-[13px] leading-6 text-muted">{publicKey ? "Review the amount once more, then approve it in your wallet. Liminal cannot access your keys." : "No account or password. Your wallet identifies this purchase and keeps it available in your order history."}</p>

                <div className="mt-8 flex flex-col gap-4">
                  <WalletMultiButton />
                  {sponsoredAction && payState !== "confirmed" && publicKey && <label className="rounded-xl border border-foreground/15 bg-white/35 p-4 text-sm"><span className="flex items-center gap-3 font-medium"><input type="checkbox" checked={gasless} onChange={(e) => setGasless(e.target.checked)} />I don’t have SOL for the network fee</span><span className="mt-1 block pl-6 text-[11px] leading-4 text-muted">A relayer can cover it for $0.01, added to the transaction.</span></label>}
                  {publicKey && payState !== "confirmed" && <button onClick={handlePay} disabled={payState === "signing" || payState === "sending"} className="inline-flex h-13 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">{payState === "signing" ? "Confirm in your wallet…" : payState === "sending" ? "Protecting payment…" : gasless && sponsoredAction ? sponsoredAction.label : (normalAction?.label ?? listing.label)}</button>}
                  {payState === "confirmed" && signature && <div className="rounded-2xl bg-foreground p-6 text-sm text-white"><p className="font-serif text-3xl tracking-[-.04em] text-accent">Payment is protected.</p><p className="mt-3 leading-6 text-white/60">The seller can now deliver. Confirm only after you receive what was promised; otherwise the payment becomes refundable after the delivery window.</p>{orderPda && <Link href={`/orders/${orderPda}`} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-foreground">Track this order</Link>}<a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block font-mono text-[10px] text-white/50 underline">View transaction</a></div>}
                  {payError && <div className="flex flex-col gap-1"><p className="text-sm font-medium text-red-700">{payError.headline}</p>{payError.detail && <p className="break-all text-[11px] text-muted">{payError.detail}</p>}</div>}
                </div>
                <div className="mt-auto pt-10 text-[11px] leading-5 text-muted">This demo uses test USDC on Solana devnet. No real-value payment is made.</div>
              </div>
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}
