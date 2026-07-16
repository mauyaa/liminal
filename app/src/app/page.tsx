import Link from "next/link";

const DEMO_ACTION_URL =
  "https://app-eight-lovat-94.vercel.app/api/actions/buy/liminal-demo-1";
const GITHUB_URL = "https://github.com/mauyaa/liminal";
const PROGRAM_ID = "AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD";

const tags = ["SOLANA", "DEVNET", "ZERO-FEE ESCROW"];

const steps = [
  {
    title: "Buyer pays",
    body: "Funds go to a neutral escrow account — not the seller.",
  },
  {
    title: "Seller delivers",
    body: "The payment is visibly locked and waiting.",
  },
  {
    title: "Buyer confirms — seller's paid",
    body: "No confirmation by the deadline? Automatic refund.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <main className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium tracking-[0.14em] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Checkout that can&apos;t be rugged.
          </h1>
          <p className="max-w-md text-lg leading-7 text-muted">
            Liminal locks the buyer&apos;s payment in on-chain escrow until they
            confirm delivery — or refunds it automatically. No platform fee.
            No middleman holding the money.
          </p>
        </div>

        <ol className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium tracking-[0.14em] text-muted">
                0{i + 1}
              </span>
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-[13px] leading-5 text-muted">{step.body}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center">
          <Link
            href="/buy/liminal-demo-1"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Try the demo checkout
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Open merchant dashboard
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            View source
          </a>
        </div>

        <p className="text-[13px] text-muted">
          Sell anywhere:{" "}
          <Link href="/embed" className="underline">
            embed a checkout button
          </Link>{" "}
          on any website with one script tag. Already bought something?{" "}
          <Link href="/orders" className="underline">
            Track your orders
          </Link>
          .
        </p>

        <div className="flex flex-col gap-1.5 text-[13px] text-muted">
          <p>
            Or open it as a Blink directly in the{" "}
            <a
              href="https://www.blinks.xyz/inspector"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Blinks Inspector
            </a>
            :
          </p>
          <code className="break-all rounded-md border border-border bg-foreground/[0.03] px-3 py-2 font-mono text-[12px]">
            {DEMO_ACTION_URL}
          </code>
        </div>

        <p className="text-[12px] text-muted">
          Program (devnet): <code className="font-mono">{PROGRAM_ID}</code>
        </p>
      </main>
    </div>
  );
}
