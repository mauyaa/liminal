"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * The no-wallet sandbox: experience a protected payment's full lifecycle -
 * fund, verify, release / refund / dispute - in under five minutes, with
 * no wallet and no real money. Everything here is a faithful simulation of
 * what the live devnet API does (webhook payloads match the real delivery
 * shape); the dispute path is a design preview and is labeled as such.
 */

type UseCase = "digital-service" | "marketplace-sale" | "milestone-project" | "agent-task";
type Verification = "buyer-confirm" | "platform-proof" | "oracle";
type LifecycleState = "CREATED" | "FUNDED" | "VERIFIED" | "SETTLED" | "REFUNDED" | "DISPUTED" | "RESOLVED";

interface EventEntry {
  at: string;
  label: string;
  webhook: string | null;
}

const USE_CASES: { id: UseCase; label: string; example: string }[] = [
  { id: "digital-service", label: "Digital service", example: "Logo design, $250, 5-day delivery" },
  { id: "marketplace-sale", label: "Marketplace sale", example: "Software license, $49, instant delivery" },
  { id: "milestone-project", label: "Milestone project", example: "$5,000 build split into releases" },
  { id: "agent-task", label: "AI-agent / API task", example: "Agent pays $2 per verified job" },
];

const VERIFICATIONS: { id: Verification; label: string; detail: string }[] = [
  {
    id: "buyer-confirm",
    label: "Buyer confirms receipt",
    detail: "Simple purchases — buyer clicks confirm, funds release. Auto-refund if the deadline passes.",
  },
  {
    id: "platform-proof",
    label: "Platform verifies delivery",
    detail: "Your API or platform event confirms the work — settlement needs no buyer action.",
  },
  {
    id: "oracle",
    label: "Signed delivery attestation",
    detail: "A trusted attestor (e.g. a TEE oracle) signs that delivery happened — verified on-chain.",
  },
];

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function webhookJson(event: string, status: string, amount: string, extra?: Record<string, unknown>): string {
  return JSON.stringify(
    {
      event,
      orderPda: "SBX7…demo",
      sku: "sandbox-demo",
      escrowStatus: status,
      buyerWallet: "BUYR…demo",
      priceUsdc: Math.round(parseFloat(amount || "0") * 1_000_000),
      mint: "AUMi…gpNZ",
      ...extra,
    },
    null,
    2
  );
}

export default function SandboxPage() {
  const [useCase, setUseCase] = useState<UseCase>("digital-service");
  const [amount, setAmount] = useState("250");
  const [deadlineHours, setDeadlineHours] = useState("120");
  const [verification, setVerification] = useState<Verification>("buyer-confirm");
  const [generated, setGenerated] = useState(false);
  const [state, setState] = useState<LifecycleState>("CREATED");
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activeWebhook, setActiveWebhook] = useState<string | null>(null);

  const pushEvent = (label: string, webhook: string | null, next: LifecycleState) => {
    setEvents((e) => [...e, { at: nowStamp(), label, webhook }]);
    setActiveWebhook(webhook);
    setState(next);
  };

  const reset = () => {
    setGenerated(false);
    setState("CREATED");
    setEvents([]);
    setActiveWebhook(null);
  };

  const generate = () => {
    setGenerated(true);
    setState("CREATED");
    setEvents([
      {
        at: nowStamp(),
        label: `Protected payment created — $${amount}, ${deadlineHours}h delivery window`,
        webhook: null,
      },
    ]);
    setActiveWebhook(null);
  };

  const artifacts = useMemo(
    () => ({
      link: "https://app-eight-lovat-94.vercel.app/buy/sandbox-demo",
      embed: `<script src="https://app-eight-lovat-94.vercel.app/embed.js"\n        data-liminal-sku="sandbox-demo" async></script>`,
      api: `curl -X POST https://app-eight-lovat-94.vercel.app/api/actions/buy/sandbox-demo \\\n  -H "Content-Type: application/json" \\\n  -d '{"account":"<buyer-wallet>"}'`,
    }),
    []
  );

  const timelineNodes = ["Created", "Funded", "Verified", state === "REFUNDED" ? "Refunded" : state === "DISPUTED" || state === "RESOLVED" ? "Resolved" : "Released"];
  const reached =
    state === "CREATED" ? 0 : state === "FUNDED" ? 1 : state === "VERIFIED" || state === "DISPUTED" ? 2 : 3;

  return (
    <div className="route-shell">
      <main className="route-main route-main--narrow">
        <div className="route-heading"><h1 className="route-title">Break the flow safely.</h1>
          <p className="route-lede">
            Design a protected payment, then drive its whole lifecycle and watch the state,
            audit trail, and webhooks your systems would receive. The real thing runs on devnet
            with the same shapes —{" "}
            <Link href="/buy/liminal-demo-1" className="underline">
              try the live demo
            </Link>{" "}
            when you&apos;re ready.
          </p>
        </div>

        <section className="surface flex flex-col gap-4 p-6 sm:p-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            1 · Pick a use case
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {USE_CASES.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setUseCase(u.id);
                  reset();
                }}
                className={`flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                  useCase === u.id ? "border-foreground" : "border-border hover:bg-foreground/5"
                }`}
              >
                <span className="text-sm font-medium">{u.label}</span>
                <span className="text-[12px] text-muted">{u.example}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="surface flex flex-col gap-4 p-6 sm:p-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            2 · Set the conditions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">Amount (USDC)</span>
              <input
                type="number"
                min="1"
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-foreground/40"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  reset();
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">Delivery deadline (hours)</span>
              <input
                type="number"
                min="1"
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-foreground/40"
                value={deadlineHours}
                onChange={(e) => {
                  setDeadlineHours(e.target.value);
                  reset();
                }}
              />
              <span className="text-[11px] leading-4 text-muted">
                Unverified past this → automatic refund.
              </span>
            </label>
          </div>
          <div className="flex flex-col gap-2">
            {VERIFICATIONS.map((v) => (
              <label
                key={v.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  verification === v.id ? "border-foreground" : "border-border hover:bg-foreground/5"
                }`}
              >
                <input
                  type="radio"
                  name="verification"
                  className="mt-1"
                  checked={verification === v.id}
                  onChange={() => {
                    setVerification(v.id);
                    reset();
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{v.label}</span>
                  <span className="text-[12px] leading-4 text-muted">{v.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="surface flex flex-col gap-4 p-6 sm:p-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            3 · Generate the protected payment
          </h2>
          {!generated ? (
            <button
              onClick={generate}
              className="inline-flex h-11 w-fit items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Generate protected payment
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 text-[12px]">
                <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
                  <span className="font-medium">Payment link</span>
                  <code className="break-all font-mono text-muted">{artifacts.link}</code>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
                  <span className="font-medium">Embed code</span>
                  <pre className="overflow-x-auto font-mono text-muted">{artifacts.embed}</pre>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
                  <span className="font-medium">API request</span>
                  <pre className="overflow-x-auto font-mono text-muted">{artifacts.api}</pre>
                </div>
              </div>
            </div>
          )}
        </section>

        {generated && (
          <section className="flex flex-col gap-4 rounded-[28px] bg-[#ded8ce] p-6 sm:p-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              4 · Drive the lifecycle
            </h2>

            <div className="flex items-start rounded-lg border border-border px-4 py-4">
              {timelineNodes.map((label, i) => {
                const done = i <= reached && reached > 0 && !(i === reached && state === "CREATED");
                const current = i === reached;
                return (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full items-center">
                      <div className={`h-px flex-1 ${i === 0 ? "bg-transparent" : i <= reached ? "bg-foreground" : "bg-border"}`} />
                      <div
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          done && !current
                            ? "bg-foreground"
                            : current
                              ? "border-2 border-foreground bg-background"
                              : "border border-border bg-background"
                        }`}
                      />
                      <div className={`h-px flex-1 ${i === timelineNodes.length - 1 ? "bg-transparent" : i < reached ? "bg-foreground" : "bg-border"}`} />
                    </div>
                    <span className={`text-[11px] tracking-wide ${current || (done && !current) ? "font-medium" : "text-muted"}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => pushEvent("Buyer paid — funds locked in escrow", webhookJson("order.funded", "FUNDED", amount), "FUNDED")}
                disabled={state !== "CREATED"}
                className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                Buyer paid
              </button>
              <button
                onClick={() =>
                  pushEvent(
                    verification === "buyer-confirm"
                      ? "Buyer confirmed receipt"
                      : verification === "platform-proof"
                        ? "Platform proof received — delivery verified"
                        : "Signed attestation verified on-chain",
                    null,
                    "VERIFIED"
                  )
                }
                disabled={state !== "FUNDED"}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:bg-foreground/5 disabled:opacity-40"
              >
                Delivery verified
              </button>
              <button
                onClick={() => pushEvent("Funds released to seller", webhookJson("order.settled", "SETTLED", amount), "SETTLED")}
                disabled={state !== "VERIFIED"}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:bg-foreground/5 disabled:opacity-40"
              >
                Release funds
              </button>
              <button
                onClick={() => pushEvent("Deadline passed unverified — automatic refund", webhookJson("order.refunded", "REFUNDED", amount), "REFUNDED")}
                disabled={state !== "FUNDED"}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:bg-foreground/5 disabled:opacity-40"
              >
                Refund buyer
              </button>
              <button
                onClick={() =>
                  pushEvent(
                    "Dispute opened — evidence window started (design preview)",
                    webhookJson("order.disputed", "DISPUTED", amount, { preview: true }),
                    "DISPUTED"
                  )
                }
                disabled={state !== "FUNDED"}
                className="inline-flex h-9 items-center justify-center rounded-full border border-dashed border-border px-4 text-[13px] font-medium text-muted transition-colors hover:bg-foreground/5 disabled:opacity-40"
              >
                Open dispute
              </button>
              {state === "DISPUTED" && (
                <button
                  onClick={() =>
                    pushEvent(
                      "Resolved: 70% released to seller, 30% refunded (design preview)",
                      webhookJson("order.resolved", "RESOLVED", amount, { sellerShareBps: 7000, preview: true }),
                      "RESOLVED"
                    )
                  }
                  className="inline-flex h-9 items-center justify-center rounded-full border border-dashed border-border px-4 text-[13px] font-medium text-muted transition-colors hover:bg-foreground/5"
                >
                  Resolve 70 / 30
                </button>
              )}
              <button
                onClick={generate}
                className="inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
              >
                Start over
              </button>
            </div>

            <p className="text-[11px] leading-4 text-muted">
              Escrow, confirmation, attestation, and automatic refunds are live on devnet today.
              Disputes and partial release are a design preview of the API in development.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Audit trail
                </span>
                <ul className="flex flex-col gap-1.5">
                  {events.map((e, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-4">
                      <span className="shrink-0 font-mono text-muted">{e.at}</span>
                      <span>{e.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Webhook your server receives
                </span>
                {activeWebhook ? (
                  <pre className="overflow-x-auto font-mono text-[11px] leading-4 text-muted">{activeWebhook}</pre>
                ) : (
                  <p className="text-[12px] text-muted">
                    Signed HMAC webhooks fire on every state change — drive the lifecycle to see
                    payloads.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <p className="border-t border-border pt-5 text-[13px] text-muted">
          Ready for the real thing? <Link href="/dashboard" className="underline">Create a live devnet listing</Link>{" "}
          or <a href="mailto:miniggs10@gmail.com?subject=Liminal%20pilot" className="underline">talk to us about a pilot</a>.
        </p>
      </main>
    </div>
  );
}
