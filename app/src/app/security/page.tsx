import Link from "next/link";

export const metadata = {
  title: "Security — Liminal",
  description: "How Liminal custodies, verifies, and protects funds — stated honestly.",
};

const LIVE = [
  {
    title: "Smart-contract custody, stated plainly",
    body: "Escrowed funds are held by an on-chain program (a Solana PDA vault) — not by Liminal the company, and not by the merchant. “Non-custodial” marketing often hides that smart-contract custody is still custody with smart-contract risk; we say it outright. The program's full source is public.",
  },
  {
    title: "Deterministic settlement rules",
    body: "Funds move on exactly three conditions: buyer confirmation, a verified on-chain Ed25519 delivery attestation from a configured oracle key, or deadline expiry (automatic refund to the buyer, permissionless to trigger). No admin key can redirect escrowed principal.",
  },
  {
    title: "Every transaction simulated before it's issued",
    body: "The API never hands out a transaction that would fail on-chain — added after a real incident where a program upgrade orphaned old accounts silently. The incident and its lessons are documented in the repository, not buried.",
  },
  {
    title: "Abuse controls",
    body: "DB-backed rate limiting on all endpoints that spend relayer funds or write state; SSRF-guarded URL fetching on store-connect import; constant-time secret comparison on scheduler auth; HMAC-signed webhooks with stable per-merchant secrets.",
  },
  {
    title: "Real end-to-end verification",
    body: "Every lifecycle path — fund, settle, automatic refund, gasless sponsorship, billing — has been executed against the real deployed program with balance-level assertions, and production endpoints carry smoke checks.",
  },
];

const ROADMAP = [
  "External smart-contract security audit before any mainnet deployment",
  "Relayer signing moved from environment secrets to managed key infrastructure (KMS)",
  "Versioned account schemas with migration and compatibility tests for program upgrades",
  "Merchant verification (KYB), transaction limits, and sanctions-screening integration via specialist partners",
  "Queue-based webhook and settlement processing with replay",
  "Independent legal review of escrow and money-transmission classification per jurisdiction",
];

export default function SecurityPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="text-sm leading-6 text-muted">
            Trust infrastructure earns trust by being precise about what it does — and honest
            about what it doesn&apos;t do yet. Liminal currently runs on Solana devnet with test
            funds only.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            In place today
          </h2>
          <div className="flex flex-col gap-3">
            {LIVE.map((item) => (
              <div key={item.title} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3">
                <span className="text-sm font-medium">{item.title}</span>
                <p className="text-[13px] leading-5 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Required before real funds — committed, not started or in progress
          </h2>
          <ul className="flex flex-col gap-2">
            {ROADMAP.map((item) => (
              <li key={item} className="text-[13px] leading-5 text-muted">
                · {item}
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-5 text-muted">
            We will not process real customer funds before the audit, key-management, and legal
            items above are complete. If a vendor tells you otherwise about their own stack, ask
            them these same questions.
          </p>
        </section>

        <p className="border-t border-border pt-5 text-[13px] text-muted">
          Full technical detail lives in the{" "}
          <a
            href="https://github.com/mauyaa/liminal#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            open repository
          </a>
          , including the verification log for every claim on this page. Questions:{" "}
          <a href="mailto:miniggs10@gmail.com?subject=Liminal%20security" className="underline">
            get in touch
          </a>
          . <Link href="/docs" className="underline">API documentation →</Link>
        </p>
      </main>
    </div>
  );
}
