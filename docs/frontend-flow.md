# Frontend flow guide

What every page should do, what the user inputs, and exactly which API it
calls. The backend for **all** of this exists, is deployed, and is verified
end to end — this document is the spec for finishing the frontend on top of
it. Pages marked **(built)** already exist; pages marked **(to build)** have
a complete, live API waiting and need only UI.

Base URL (devnet production): `https://app-eight-lovat-94.vercel.app`

The one universal pattern (already used by every built page): call a route,
get back `{ transaction: base64 }`, then
`Transaction.from(Buffer.from(tx, "base64"))` → `wallet.signTransaction` →
`connection.sendRawTransaction` → `confirmTransaction` → POST the relevant
`*/sync` route so the DB catches up. Every route simulates before returning,
so API errors carry the real on-chain failure reason — always render
`body.message` from a non-OK response.

---

## Buyer-facing pages

### `/buy/[sku]` — checkout **(built)**
- Loads `GET /api/actions/buy/[sku]` (title, description, icon, both
  actions), wallet connect, optional "Pay gas fees for me" checkbox
  (routes through `POST …?sponsored=true` + `POST /api/relay/submit`).
- After landing: `POST /api/orders/sync { orderPda }`.
- **Missing piece (to build):** after the purchase confirms, link to the
  order page below — the buyer currently has nowhere to go.

### `/orders/[orderPda]` — order status + confirm receipt **(to build)**
The most important missing page: it's where escrow actually resolves.
- Load `GET /api/orders/[orderPda]` → title, price, store, status, and
  `onChain.deliveryDeadline` / `onChain.refundableNow`.
- Status FUNDED + connected wallet == `onChain.buyer`:
  - Primary button **"Confirm receipt — release funds"** →
    `POST /api/orders/[orderPda]/settle` (no body) → sign → send →
    `POST /api/orders/sync`.
  - Show the deadline: "Not delivered? Automatically refundable after
    {deliveryDeadline}."
- Status FUNDED + `refundableNow: true`: show **"Claim refund now"** →
  `POST /api/orders/[orderPda]/refund { payerWallet }` → sign → send →
  sync. Also note: "or do nothing — refunds are processed automatically."
- Status SETTLED / REFUNDED: terminal state + link
  `https://explorer.solana.com/tx/{resolutionTxSignature}?cluster=devnet`.

### `/orders` — purchase history **(to build)**
- Wallet connect, then `GET /api/orders?buyerWallet=` → list rows
  (title, store, price, status badge, date), each linking to
  `/orders/[orderPda]`.

### `/subscribe/[planId]` — subscribe **(built)**
- Two-step `requiresFollowUp` flow, cancel button, sync — all wired.

---

## Merchant dashboard (`/dashboard`, tabbed) **(built, two gaps)**

- **Listings / Subscriptions / Webhook / Oracle tabs**: built and live.
- **Gap 1 — stats header (to build):** render
  `GET /api/merchant/stats?merchantWallet=` as 4–5 number cards (listings,
  orders by status, settled volume /1e6 as USD, subscribers) above the
  tabs.
- **Gap 2 — orders tab (to build):** `GET /api/orders?merchantWallet=` —
  same list UI as buyer history, but seller-side. A FUNDED row is the
  merchant's cue to deliver; SETTLED means paid.
- Note: a listing is single-sale (one on-chain order per listing). After a
  sale settles, "Relist" = create a new listing with a fresh SKU — a
  protocol-v2 item, worth a small explainer tooltip in the UI.

---

## Operational notes for the frontend

- **Poll endpoints** (`/api/webhooks/poll`, `/api/subscriptions/poll`,
  `/api/refunds/poll`) are cron-triggered with `Authorization: Bearer
  CRON_SECRET` — never called from the frontend. Wire them in `vercel.json`
  crons (e.g. every 5 min) when ready.
- **Rate limits** return 429 with a message — surface it verbatim.
- **Demo mint** (devnet): `AUMiaz7S6rxn2E36tSpFyNcQwfZ5FroeesU4XMHngpNZ`
  (prefilled as the default in all dashboard forms).
- Mobile/Telegram checkout (`/api/mobile/checkout?sku=`) is a redirect
  flow with its own confirmation page — no frontend work needed beyond
  linking to it where a mobile context is detected.
