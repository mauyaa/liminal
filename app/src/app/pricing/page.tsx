import Link from "next/link";

export const metadata = {
  title: "Pricing — Liminal",
  description: "Plans for conditional stablecoin payments, from free sandbox to enterprise.",
};

const TIERS = [
  {
    name: "Sandbox",
    price: "Free",
    fee: "",
    who: "Developers testing on devnet",
    features: ["Full API on devnet", "No-wallet simulator", "Test webhooks", "Community support"],
  },
  {
    name: "Launch",
    price: "$49/mo",
    fee: "+ 0.75% per protected payment",
    who: "Small merchants & early startups",
    features: ["Protected payments & auto-refunds", "Signed webhooks", "Embed & payment links", "Email support"],
  },
  {
    name: "Growth",
    price: "$299/mo",
    fee: "+ 0.35% per protected payment",
    who: "Marketplaces & service platforms",
    features: ["Everything in Launch", "Proof adapters", "Reconciliation exports", "Priority support"],
    highlight: true,
  },
  {
    name: "Scale",
    price: "$1,000+/mo",
    fee: "+ 0.15–0.25% per protected payment",
    who: "High-volume platforms",
    features: ["Everything in Growth", "Volume pricing", "Webhook replay", "Dedicated support"],
  },
];

const ENTERPRISE = [
  "Service-level commitments",
  "Compliance integrations (KYB, sanctions screening, monitoring)",
  "Custom proof adapters",
  "Role-based access & audit reports",
  "Security documentation & reviews",
  "Optional dedicated deployment",
];

export default function PricingPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <main className="flex w-full max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="max-w-xl text-sm leading-6 text-muted">
            You&apos;re not buying cheap transactions — you&apos;re buying fewer disputes, higher
            conversion, automatic settlement, and an audit trail your finance team can trust.
            Prices below are the planned commercial structure; everything currently runs free on
            devnet while we onboard design partners.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col gap-3 rounded-xl border p-5 ${
                t.highlight ? "border-foreground" : "border-border"
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t.name}</span>
                <span className="text-2xl font-semibold tracking-tight">{t.price}</span>
                {t.fee && <span className="text-[12px] text-muted">{t.fee}</span>}
                <span className="text-[12px] text-muted">{t.who}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {t.features.map((f) => (
                  <li key={f} className="text-[13px] leading-5 text-muted">
                    · {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border p-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Enterprise</span>
            <span className="text-lg font-semibold tracking-tight">From $5,000/mo</span>
            <span className="text-[12px] text-muted">
              Large companies requiring SLA, compliance, and custom infrastructure
            </span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {ENTERPRISE.map((f) => (
              <li key={f} className="text-[13px] leading-5 text-muted">
                · {f}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">
            Human dispute resolution is billed separately — fixed fee or a percentage of the
            disputed value.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-5">
          <span className="text-sm font-medium">Design-partner pilot</span>
          <p className="text-[13px] leading-6 text-muted">
            For the first three platforms processing real stablecoin transactions:{" "}
            <span className="font-medium text-foreground">
              $500 onboarding + $99/month + 0.5% of protected volume for three months
            </span>
            , including personal integration, a custom proof adapter, and a weekly product
            session.
          </p>
          <a
            href="mailto:miniggs10@gmail.com?subject=Liminal%20design%20partner%20pilot"
            className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Apply for a pilot
          </a>
        </div>

        <p className="text-[13px] text-muted">
          <Link href="/sandbox" className="underline">
            Try the sandbox
          </Link>{" "}
          first — no wallet, no signup, under five minutes.
        </p>
      </main>
    </div>
  );
}
