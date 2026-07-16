import Link from "next/link";

export const metadata = {
  title: "Documentation — Liminal",
  description: "API reference and integration quickstart for conditional stablecoin payments.",
};

const BASE = "https://app-eight-lovat-94.vercel.app";

const GROUPS: { title: string; endpoints: { method: string; path: string; what: string }[] }[] = [
  {
    title: "Protected payments",
    endpoints: [
      { method: "POST", path: "/api/merchant/listings", what: "Create a listing → unsigned initialize_listing tx" },
      { method: "GET/POST", path: "/api/actions/buy/{sku}", what: "Checkout metadata / build the funding tx (add ?sponsored=true for gasless)" },
      { method: "POST", path: "/api/orders/{orderPda}/settle", what: "Buyer confirms receipt → release funds" },
      { method: "POST", path: "/api/orders/{orderPda}/refund", what: "Permissionless refund once the deadline passes" },
      { method: "GET", path: "/api/orders/{orderPda}", what: "Order detail merged with live on-chain state" },
      { method: "GET", path: "/api/orders?buyerWallet= | ?merchantWallet=", what: "Order history for either side" },
      { method: "POST", path: "/api/orders/sync", what: "Sync DB to chain after a client-submitted tx; fires webhooks" },
    ],
  },
  {
    title: "Store connect & discovery",
    endpoints: [
      { method: "POST", path: "/api/merchant/import-product", what: "URL → product data (JSON-LD/Open Graph) to prefill a listing" },
      { method: "GET", path: "/.well-known/agent-pay", what: "Machine-readable catalog + full order-lifecycle endpoints for AI agents" },
      { method: "GET", path: "/embed.js", what: "One-script checkout button for any website" },
    ],
  },
  {
    title: "Subscriptions",
    endpoints: [
      { method: "POST/GET", path: "/api/merchant/plans", what: "Create / list recurring plans" },
      { method: "GET/POST", path: "/api/actions/subscribe/{planId}", what: "Two-step subscribe flow (requiresFollowUp)" },
      { method: "POST", path: "/api/merchant/plans/{planId}/collect", what: "Pull one period's payment" },
      { method: "POST", path: "/api/subscriptions/{planId}/cancel", what: "Cancel (effective end of paid period)" },
    ],
  },
  {
    title: "Automation & operations",
    endpoints: [
      { method: "POST/GET", path: "/api/merchant/webhook", what: "Set / read the signed-webhook endpoint" },
      { method: "GET", path: "/api/merchant/stats", what: "Volume, order counts, subscribers" },
      { method: "GET", path: "/api/{webhooks|subscriptions|refunds}/poll", what: "Autonomous engines (CRON_SECRET-gated)" },
      { method: "GET", path: "/api/health", what: "Deployment health + schema/migration status" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
          <p className="text-sm leading-6 text-muted">
            One integration pattern everywhere: call an endpoint, receive an unsigned
            transaction, have the wallet sign it, submit, then sync. Your platform never holds
            funds and never needs a private key on its servers. Deep documentation for every
            endpoint lives in the{" "}
            <a
              href="https://github.com/mauyaa/liminal#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              repository README
            </a>
            .
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Quickstart — a protected payment in three calls
          </h2>
          <pre className="overflow-x-auto rounded-lg border border-border bg-foreground/[0.03] px-4 py-3 font-mono text-[12px] leading-5">
{`# 1 · Create a listing (returns an unsigned tx for the merchant wallet)
curl -X POST ${BASE}/api/merchant/listings \\
  -H "Content-Type: application/json" \\
  -d '{"merchantWallet":"<wallet>","storeName":"Aurora Prints",
       "sku":"sticker-pack-01","title":"Sticker pack",
       "imageUrl":"https://…/p.png","priceUsdc":12500000,
       "mint":"AUMiaz7S6rxn2E36tSpFyNcQwfZ5FroeesU4XMHngpNZ",
       "deliveryWindowSeconds":86400}'

# 2 · Buyer pays — share the link, the embed, or build the tx yourself
open ${BASE}/buy/sticker-pack-01

# 3 · Settlement — buyer confirms, your platform verifies, or the
#     deadline passes and the refund engine returns the funds
curl -X POST ${BASE}/api/orders/<orderPda>/settle`}
          </pre>
          <p className="text-[12px] text-muted">
            Try it with no wallet at all in the <Link href="/sandbox" className="underline">sandbox</Link>, or against
            the live devnet <Link href="/buy/liminal-demo-1" className="underline">demo checkout</Link>.
          </p>
        </section>

        {GROUPS.map((g) => (
          <section key={g.title} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{g.title}</h2>
            <div className="flex flex-col">
              {g.endpoints.map((e) => (
                <div
                  key={e.path + e.method}
                  className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <code className="shrink-0 font-mono text-[12px] font-medium">{e.method}</code>
                  <code className="shrink-0 break-all font-mono text-[12px]">{e.path}</code>
                  <span className="text-[12px] text-muted sm:ml-auto sm:text-right">{e.what}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Webhooks</h2>
          <p className="text-[13px] leading-6 text-muted">
            Register a URL once via <code className="font-mono text-[12px]">POST /api/merchant/webhook</code> and
            receive signed JSON on every state change (<code className="font-mono text-[12px]">order.funded</code>,{" "}
            <code className="font-mono text-[12px]">order.settled</code>,{" "}
            <code className="font-mono text-[12px]">order.refunded</code>). Verify the{" "}
            <code className="font-mono text-[12px]">X-Liminal-Signature</code> header — hex HMAC-SHA256 of the raw
            body with your webhook secret — before trusting a payload. Delivery retries with backoff, and the
            autonomous pollers guarantee events fire even when no client calls sync.
          </p>
        </section>
      </main>
    </div>
  );
}
