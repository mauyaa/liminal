import Link from "next/link";

export const metadata = {
  title: "Documentation — Liminal",
  description: "API reference and integration quickstart for conditional stablecoin payments.",
};

const BASE = "https://app-eight-lovat-94.vercel.app";

const GROUPS: { title: string; endpoints: { method: string; path: string; what: string }[] }[] = [
  {
    title: "Pay links",
    endpoints: [
      { method: "POST", path: "/api/merchant/listings", what: "Create a listing → unsigned initialize_listing tx (title/price/deadline is enough; sku/image/store name are optional)" },
      { method: "GET/POST", path: "/api/actions/buy/{sku}", what: "Checkout metadata / build the funding tx (add ?sponsored=true for gasless)" },
      { method: "GET", path: "/api/orders/{orderPda}", what: "Order detail merged with live on-chain state, including any dispute verdict" },
      { method: "GET", path: "/api/orders?buyerWallet= | ?merchantWallet=", what: "Order history for either side" },
      { method: "POST", path: "/api/orders/sync", what: "Sync DB to chain after a client-submitted tx; fires webhooks" },
    ],
  },
  {
    title: "Delivery & release",
    endpoints: [
      { method: "POST", path: "/api/orders/{orderPda}/settle", what: "Buyer confirms receipt → release funds (before any delivery signal)" },
      { method: "POST", path: "/api/orders/{orderPda}/refund", what: "Permissionless refund once the delivery deadline passes" },
      { method: "POST", path: "/api/orders/{orderPda}/signal-delivery", what: "Seller marks delivered (wallet-signed message, no gas) → opens a 48h challenge window" },
      { method: "POST", path: "/api/orders/{orderPda}/confirm", what: "Buyer releases early once delivery is signaled" },
      { method: "POST", path: "/api/orders/{orderPda}/challenge", what: "Buyer disputes a signaled delivery before the window closes" },
      { method: "GET", path: "/api/deliveries/poll", what: "Autonomously finalizes unchallenged signaled deliveries (CRON_SECRET-gated)" },
    ],
  },
  {
    title: "Disputes",
    endpoints: [
      { method: "GET/POST", path: "/api/orders/{orderPda}/evidence", what: "Either party attaches a statement (wallet-signed, no gas)" },
      { method: "GET", path: "/api/admin/disputes", what: "Open disputes with evidence (ADMIN_SECRET-gated)" },
      { method: "POST", path: "/api/admin/disputes/{orderPda}/resolve", what: "Operator issues a split verdict → oracle-attested resolve_dispute on-chain (ADMIN_SECRET-gated)" },
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
    title: "Automation & operations",
    endpoints: [
      { method: "POST/GET", path: "/api/merchant/webhook", what: "Set / read the signed-webhook endpoint" },
      { method: "GET", path: "/api/merchant/stats", what: "Volume, order counts, listings" },
      { method: "GET", path: "/api/{webhooks|refunds|deliveries}/poll", what: "Autonomous engines (CRON_SECRET-gated)" },
      { method: "GET", path: "/api/health", what: "Deployment health + schema/migration status" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="route-shell">
      <main className="route-main">
        <div className="route-heading">
          <h1 className="route-title">Ship protected payments.</h1>
          <p className="route-lede">
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

        <section className="surface flex flex-col gap-4 p-6 sm:p-9">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Quickstart — a protected payment in three calls
          </h2>
          <pre className="overflow-x-auto rounded-2xl bg-foreground p-5 font-mono text-[11px] leading-5 text-white">
{`# 1 · Create a listing (returns an unsigned tx for the merchant wallet)
#     - title, priceUsdc, and deliveryWindowSeconds are the only required fields
curl -X POST ${BASE}/api/merchant/listings \\
  -H "Content-Type: application/json" \\
  -d '{"merchantWallet":"<wallet>","title":"Sticker pack",
       "priceUsdc":12500000,"deliveryWindowSeconds":86400}'

# 2 · Buyer pays — share the returned link, or embed it with a script tag
open ${BASE}/pay/<sku>

# 3 · Release — buyer confirms, the seller signals delivery (opening a
#     48h challenge window), or the deadline passes and funds return to
#     the buyer automatically
curl -X POST ${BASE}/api/orders/<orderPda>/settle`}
          </pre>
          <p className="text-[12px] text-muted">
            Try it against the live devnet <Link href="/pay/liminal-demo" className="underline">demo checkout</Link>,
            or create your own in <Link href="/new" className="underline">the link creator</Link>.
          </p>
        </section>

        {GROUPS.map((g) => (
          <section key={g.title} className="surface flex flex-col gap-3 p-6 sm:p-8">
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

        <section className="surface flex flex-col gap-3 p-6 sm:p-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Webhooks</h2>
          <p className="text-[13px] leading-6 text-muted">
            Register a URL once via <code className="font-mono text-[12px]">POST /api/merchant/webhook</code> and
            receive signed JSON on every state change (<code className="font-mono text-[12px]">order.funded</code>,{" "}
            <code className="font-mono text-[12px]">order.delivery_signaled</code>,{" "}
            <code className="font-mono text-[12px]">order.settled</code>,{" "}
            <code className="font-mono text-[12px]">order.refunded</code>,{" "}
            <code className="font-mono text-[12px]">order.disputed</code>,{" "}
            <code className="font-mono text-[12px]">order.resolved</code>). Verify the{" "}
            <code className="font-mono text-[12px]">X-Liminal-Signature</code> header — hex HMAC-SHA256 of the raw
            body with your webhook secret — before trusting a payload. Delivery retries with backoff, and the
            autonomous pollers guarantee events fire even when no client calls sync.
          </p>
        </section>
      </main>
    </div>
  );
}
