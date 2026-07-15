const DEMO_ACTION_URL =
  "https://app-eight-lovat-94.vercel.app/api/actions/buy/liminal-demo-1";
const GITHUB_URL = "https://github.com/mauyaa/liminal";
const PROGRAM_ID = "AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD";

const tags = ["SOLANA", "DEVNET", "ZERO-FEE ESCROW"];

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
            Liminal Protocol
          </h1>
          <p className="max-w-md text-lg leading-7 text-muted">
            Headless, zero-fee peer-to-peer escrow checkout on Solana.
          </p>
        </div>

        <p className="max-w-md text-[15px] leading-6 text-muted">
          A buyer&apos;s payment is locked in an on-chain escrow account until
          they confirm delivery — or automatically refunded if a delivery
          deadline passes unconfirmed. No platform fee, no custodian.
        </p>

        <div className="flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center">
          <a
            href="https://www.blinks.xyz/inspector"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Try the demo checkout
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            View source
          </a>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] text-muted">
          <p>
            Paste this action URL into the Blinks Inspector above to sign a
            real devnet transaction:
          </p>
          <code className="break-all rounded-md border border-border bg-foreground/[0.03] px-3 py-2 font-mono text-[12px]">
            {DEMO_ACTION_URL}
          </code>
        </div>

        <p className="text-[12px] text-muted">
          Program (devnet):{" "}
          <code className="font-mono">{PROGRAM_ID}</code> — devnet only, no
          real funds.
        </p>
      </main>
    </div>
  );
}
