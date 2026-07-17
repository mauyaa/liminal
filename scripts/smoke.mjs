/**
 * Production smoke tests: every public customer journey, asserted against
 * the live deployment. Run locally (`node scripts/smoke.mjs`) or on the
 * GitHub Actions schedule (.github/workflows/smoke.yml). Override the
 * target with BASE_URL. Exits non-zero on any failure.
 */
const BASE = process.env.BASE_URL ?? "https://app-eight-lovat-94.vercel.app";
const DEMO_ORDER = "BHmUPeVvfUydDzxTLNfRs6EXbkJ5AYwhHeYu9vFagwEZ";

let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const text = await res.text().catch(() => "");
  return { status: res.status, text, location: res.headers.get("location") ?? "" };
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const journeys = [
  // Marketing & product pages
  async () => {
    const r = await get("/");
    check("landing renders the actual escrow product", r.status === 200 && r.text.includes("Get paid by strangers") && r.text.includes("Create your payment link"));
  },
  async () => {
    for (const p of ["/dashboard", "/new", "/sandbox", "/pricing", "/docs", "/security", "/embed", "/orders"]) {
      const r = await get(p);
      check(`${p} renders`, r.status === 200);
    }
  },
  // Buyer journey
  async () => {
    const r = await get("/pay/liminal-demo");
    check("checkout page renders", r.status === 200);
  },
  async () => {
    const r = await get("/buy/liminal-demo");
    check("old /buy link redirects to /pay", r.status >= 300 && r.status < 400 && r.location.includes("/pay/liminal-demo"));
  },
  async () => {
    const r = await get("/api/actions/buy/liminal-demo");
    check("checkout metadata has price + delivery window", r.status === 200 && r.text.includes('"deliveryWindowSeconds"'));
  },
  async () => {
    const r = await postJson("/api/actions/buy/liminal-demo", { account: "not-a-pubkey" });
    check("checkout rejects invalid buyer", r.status === 400);
  },
  async () => {
    const r = await get(`/orders/${DEMO_ORDER}`);
    check("order page renders", r.status === 200);
  },
  async () => {
    const r = await get(`/api/orders/${DEMO_ORDER}`);
    check("order detail merges on-chain state", r.status === 200 && r.text.includes('"onChain"'));
  },
  async () => {
    const r = await get("/api/orders?buyerWallet=x&merchantWallet=y");
    check("order list rejects ambiguous params", r.status === 400);
  },
  // Discovery & embed
  async () => {
    const r = await get("/.well-known/agent-pay");
    check("agent manifest exposes lifecycle", r.status === 200 && r.text.includes('"orderLifecycle"'));
  },
  async () => {
    const r = await get("/.well-known/solana.txt");
    check("sRFC-35 manifest served", r.status === 200 && r.text.includes("solana-program-address="));
  },
  async () => {
    const r = await get("/embed.js");
    check("embed script served", r.status === 200 && r.text.includes("data-liminal-sku"));
  },
  // Store-connect import (guard + happy path via the live fixture)
  async () => {
    const r = await postJson("/api/merchant/import-product", { url: "http://localhost:8899/" });
    check("import refuses private URLs", r.status === 400);
  },
  async () => {
    const r = await postJson("/api/merchant/import-product", { url: `${BASE}/demo-product.html` });
    check("import extracts full product", r.status === 200 && r.body?.priceUsd === 12.5, JSON.stringify(r.body)?.slice(0, 120));
  },
  // Automation engines stay locked
  async () => {
    for (const p of ["/api/webhooks/poll", "/api/subscriptions/poll", "/api/refunds/poll"]) {
      const r = await get(p);
      check(`${p} requires auth`, r.status === 401);
    }
  },
  // Deployment health (includes schema/migration drift)
  async () => {
    const r = await get("/api/health");
    check("health: migrations + env ok", r.status === 200 && r.text.includes('"ok":true'), r.text.slice(0, 160));
  },
];

for (const journey of journeys) {
  try {
    await journey();
  } catch (err) {
    check("journey threw", false, err.message);
  }
}

console.log(failures === 0 ? "\nSMOKE: ALL PASSED" : `\nSMOKE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
