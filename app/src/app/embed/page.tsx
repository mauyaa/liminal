import Script from "next/script";

export const metadata = {
  title: "Embed - Liminal Protocol",
  description: "Add an escrowed Solana checkout button to any website with one script tag.",
};

const SNIPPET = `<script src="https://app-eight-lovat-94.vercel.app/embed.js"
        data-liminal-sku="liminal-demo-1" async></script>`;

export default function EmbedPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Sell anywhere with one script tag</h1>
          <p className="text-sm leading-6 text-muted">
            Paste this on any website - a blog, a docs page, a plain HTML file - and it renders
            a checkout button for your listing. The buyer pays into on-chain escrow on the
            hosted checkout page; your site never touches wallets or funds. The label shows the
            live title and price straight from the same endpoint wallets use, so it can&apos;t
            drift from what the buyer actually pays.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium tracking-tight">The snippet</h2>
          <pre className="overflow-x-auto rounded-md border border-border bg-foreground/[0.03] px-4 py-3 font-mono text-[12px] leading-5">
            {SNIPPET}
          </pre>
          <p className="text-[13px] text-muted">
            Swap <code className="font-mono">data-liminal-sku</code> for your own listing&apos;s SKU
            (create one in the <a href="/dashboard" className="underline">dashboard</a>). Optional:{" "}
            <code className="font-mono">data-label</code> for custom text,{" "}
            <code className="font-mono">data-theme=&quot;light&quot;</code> for a light button.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
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
