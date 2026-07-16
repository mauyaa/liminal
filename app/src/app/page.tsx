import Link from "next/link";

const GITHUB_URL = "https://github.com/mauyaa/liminal";
const PROGRAM_ID = "AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD";

const tags = ["CONDITIONAL STABLECOIN PAYMENTS", "SOLANA", "DEVNET"];

const steps = [
  {
    title: "Funds lock on-chain",
    body: "The buyer pays into neutral escrow — your platform never holds the money.",
  },
  {
    title: "Completion is proven",
    body: "Buyer confirmation, a signed delivery attestation, or your platform's own event.",
  },
  {
    title: "Settlement is automatic",
    body: "Funds release to the seller — or return to the buyer when the deadline passes. No manual reconciliation.",
  },
];

const useCases = [
  "Freelance & service marketplaces",
  "Digital agencies & dev studios",
  "Software & license sellers",
  "AI-agent & API marketplaces",
  "Creator commerce",
  "Cross-border contractors",
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
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Stablecoin payments that release only when the work is done.
          </h1>
          <p className="max-w-lg text-lg leading-7 text-muted">
            Liminal is programmable escrow infrastructure for marketplaces and
            digital-service platforms: lock funds, verify completion, and
            automatically release or refund — through one API, without holding
            customer money yourself.
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
            href="/sandbox"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Create a protected test payment
          </Link>
          <a
            href="mailto:miniggs10@gmail.com?subject=Liminal%20pilot"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Talk to us about a pilot
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted">
            BUILT FOR
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {useCases.map((u) => (
              <span key={u} className="text-[13px] text-muted">
                {u}
              </span>
            ))}
          </div>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-[13px]">
          <Link href="/sandbox" className="underline">
            Sandbox
          </Link>
          <Link href="/pricing" className="underline">
            Pricing
          </Link>
          <Link href="/docs" className="underline">
            Documentation
          </Link>
          <Link href="/security" className="underline">
            Security
          </Link>
          <Link href="/embed" className="underline">
            Embed
          </Link>
          <Link href="/dashboard" className="underline">
            Dashboard
          </Link>
          <Link href="/buy/liminal-demo-1" className="underline">
            Live demo checkout
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="underline">
            GitHub
          </a>
        </nav>

        <p className="text-[12px] text-muted">
          Program (devnet): <code className="font-mono">{PROGRAM_ID}</code>
        </p>
      </main>
    </div>
  );
}
