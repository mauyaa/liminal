import Script from "next/script";

export const metadata = {
  title: "Embed - Liminal Protocol",
  description: "Add an escrowed Solana checkout button to any website with one script tag.",
};

const SNIPPET = `<script src="https://app-eight-lovat-94.vercel.app/embed.js"
        data-liminal-sku="liminal-demo-1" async></script>`;

export default function EmbedPage() {
  return (
    <div className="route-shell">
      <main className="route-main route-main--narrow">
        <div className="route-heading"><h1 className="route-title">Sell anywhere.</h1>
          <p className="route-lede">
            Paste this on any website - a blog, a docs page, a plain HTML file - and it renders
            a checkout button for your listing. The buyer pays into on-chain escrow on the
            hosted checkout page; your site never touches wallets or funds. The label shows the
            live title and price straight from the same endpoint wallets use, so it can&apos;t
            drift from what the buyer actually pays.
          </p>
        </div>

        <div className="surface flex flex-col gap-3 p-6 sm:p-8">
          <h2 className="text-sm font-medium tracking-tight">The snippet</h2>
          <pre className="overflow-x-auto rounded-2xl bg-foreground px-5 py-5 font-mono text-[11px] leading-5 text-white">
            {SNIPPET}
          </pre>
          <p className="text-[13px] text-muted">
            Swap <code className="font-mono">data-liminal-sku</code> for your own listing&apos;s SKU
            (create one in the <a href="/dashboard" className="underline">dashboard</a>). Optional:{" "}
            <code className="font-mono">data-label</code> for custom text,{" "}
            <code className="font-mono">data-theme=&quot;light&quot;</code> for a light button.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-[28px] bg-[#ded8ce] p-6 sm:p-8">
          <h2 className="text-sm font-medium tracking-tight">Live demo - this is the real embed script running</h2>
          <Script src="/embed.js" data-liminal-sku="liminal-demo-1" strategy="lazyOnload" />
          <p className="text-[13px] text-muted">
            Clicking opens the hosted checkout for the devnet demo listing in a popup.
          </p>
        </div>
      </main>
    </div>
  );
}
