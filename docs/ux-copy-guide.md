# UX copy guide — what every page says, and why

The design brief for the frontend: every screen's purpose, layout, exact
words, and where the user goes next. Written so a designer can build the
best-in-class version of each page without guessing at content.

---

## Voice and rules (read first — these make it feel "next generation")

1. **Plain words, zero crypto jargon on buyer pages.** Buyers see
   "Your payment is protected" — never "funds locked in a PDA."
   Merchant/advanced pages may use precise terms (escrow, mint, on-chain).
2. **Every screen answers four questions**, in order: Where am I? What
   just happened? What happens next? What can I do right now?
3. **The escrow guarantee IS the product — restate it at every money
   moment.** The one-liner, reusable everywhere:
   > "Your payment sits in a neutral escrow account — the seller is paid
   > only when you confirm delivery, or you're refunded automatically."
4. **One primary action per screen.** Everything else is quiet.
5. **Deadlines are absolute.** "Refundable after Jul 18, 3:42 PM" — never
   only "in 24 hours."
6. **Buttons say the outcome, not the mechanism.** "Confirm receipt —
   release funds," not "Sign transaction."
7. **Errors: what happened + what to do**, one sentence each. Surface the
   API's `message` verbatim underneath as fine print (it names the real
   on-chain reason).
8. **Progress verbs during waits:** "Confirm in your wallet…" →
   "Sending…" → done. Never a spinner with no words.
9. **Always-visible network badge:** `DEVNET — test money, nothing real`.
   Honesty is part of the premium feel.
10. **Status vocabulary — same four words everywhere:**
    | Status | Buyer sees | Merchant sees |
    |---|---|---|
    | INITIALIZED | Not yet purchased | Live — awaiting buyer |
    | FUNDED | Payment protected in escrow | Paid into escrow — deliver now |
    | SETTLED | Complete | Paid out |
    | REFUNDED | Refunded in full | Refunded to buyer |

---

## The two journeys (design the pages in this order)

**Buyer:** Landing → Checkout → (wallet approve) → Order status → Confirm
receipt → Done. Escape hatch at every step: deadline passes → automatic
refund, no action needed.

**Merchant:** Landing → Dashboard → Create listing → Share (link, embed,
Telegram) → Order shows "Paid into escrow — deliver now" → deliver →
buyer confirms → "Paid out."

---

## 1. Landing — `/`

**Purpose:** one idea in five seconds: *commerce where nobody can get
scammed.* Route visitors into buyer demo or merchant dashboard.

**Displays:** badge row · headline · subhead · how-it-works (3 steps) ·
two CTAs + source link · embed/orders footer links.

**Copy:**
- Badge: `SOLANA · DEVNET · ZERO-FEE ESCROW`
- Headline: **"Checkout that can't be rugged."**
  (alternate: "Trustless checkout for the open internet")
- Subhead: "Liminal locks the buyer's payment in on-chain escrow until
  they confirm delivery — or refunds it automatically. No platform fee.
  No middleman holding the money."
- How it works — three steps, one line each:
  1. **Buyer pays** — funds go to a neutral escrow account, not the seller.
  2. **Seller delivers** — the payment is visibly locked and waiting.
  3. **Buyer confirms — seller's paid.** No confirmation by the deadline?
     Automatic refund.
- Primary CTA: `Try the demo checkout` · Secondary: `Open merchant
  dashboard` · Tertiary: `View source`
- Footer line: "Sell anywhere: [embed a checkout button] on any website ·
  [track your orders]"

**Next:** buyer → `/buy/liminal-demo-1`; merchant → `/dashboard`.

---

## 2. Checkout — `/buy/[sku]`

**Purpose:** the highest-stakes screen. Convert interest into a funded
escrow with total clarity about what the buyer is agreeing to.

**Displays:** product image · title · description · price (large) ·
trust strip · wallet connect · gasless option · pay button · post-pay
success block.

**Copy:**
- Trust strip (directly under price — always visible):
  "🔒 Protected purchase — the seller is paid only when you confirm
  delivery. Not delivered by **{deadline date, time}**? You're refunded
  automatically."
- Wallet not connected: button `Connect wallet to buy` — helper: "You
  approve the payment in your own wallet. Liminal never holds your keys."
- Gasless checkbox: `Pay network fees for me (no SOL needed)` — helper:
  "A relayer covers the network fee for a flat $0.01, added to your total."
- Pay button: `Buy for $1.00` / gasless: `Buy for $1.00 — no SOL needed`
- In progress: `Confirm in your wallet…` → `Sending…`
- Success block:
  - Headline: **"Payment protected."**
  - Body: "Your $1.00 is in escrow — the seller has been notified to
    deliver. Confirm receipt when it arrives, or do nothing and get
    refunded automatically after {deadline}."
  - Primary: `Track this order` · quiet link: `View transaction`
- Errors:
  - Insufficient funds: "Your wallet doesn't have enough {token} for this
    purchase. Top up and try again."
  - Rejected in wallet: "No problem — nothing was charged. Ready when you
    are."
  - Anything else: "That didn't go through — nothing was charged. Try
    again in a moment." + API `message` as fine print.

**Next:** `/orders/[orderPda]`.

---

## 3. Order status — `/orders/[orderPda]` ⭐ the trust centerpiece

**Purpose:** the page buyers screenshot. Shows exactly where the money is
and the single action that moves it. Design this one best.

**Displays:** product summary row · **status timeline** (the hero) ·
contextual action · deadline line · transaction links · order id.

**Timeline — four nodes, current one emphasized:**
`Paid → In escrow → Delivered? → Complete` (final node becomes
`Refunded` on the refund path).

**Copy per state:**
- FUNDED, viewer is the buyer, before deadline:
  - Status line: **"Your payment is protected in escrow."**
  - Sub: "Once your order arrives, confirm below to release the payment.
    Not delivered by **{deadline}**? You get refunded automatically —
    no action needed."
  - Primary: `Confirm receipt — release funds to seller`
  - Under-button fine print: "Only confirm once you actually have your
    order. This releases the money and can't be undone."
- FUNDED, deadline passed:
  - Status line: **"Delivery deadline passed."**
  - Sub: "You can claim your refund now — or do nothing, it's processed
    automatically."
  - Primary: `Claim refund now`
- FUNDED, viewer isn't the buyer: same status, no buttons —
  "Connect the buying wallet to manage this order."
- SETTLED:
  - **"Order complete."** "You confirmed delivery and the seller was
    paid. Thanks for using escrow that just works."
- REFUNDED:
  - **"Refunded in full."** "Delivery wasn't confirmed by the deadline,
    so your payment came straight back. That's the whole point."
- Links: `Payment transaction` · `Settlement transaction` /
  `Refund transaction` · `All my orders`

**Next:** back to `/orders`; merchants arrive here from the Orders tab.

---

## 4. Order history — `/orders`

**Purpose:** one glance = status of everything I've bought.

**Copy:**
- Title: **"Your orders"**
- Not connected: "Connect the wallet you purchased with."
- Empty: "No orders yet for this wallet. Everything you buy through
  Liminal shows up here with live escrow status."
- Rows: title · store · price · status chip (buyer vocabulary from the
  table above) → each row opens the order page.

---

## 5. Subscribe — `/subscribe/[planId]`

**Purpose:** recurring payments without the creepiness — lead with
control ("cancel anytime, on-chain, nobody can stop you").

**Displays:** plan image · title · **price/period (large)** · what-you're
-agreeing-to strip · subscribe button (two-step aware) · cancel section.

**Copy:**
- Price line: "**$0.50 / day** · billed to your wallet each period"
- Agreement strip: "You're authorizing this plan to collect **{price}**
  once per {period}. Cancel anytime — cancellation is enforced on-chain,
  not by the merchant's goodwill."
- First-time flow (two wallet approvals — name it, or it feels broken):
  - Step label before first approval: "Step 1 of 2 — one-time setup of
    your subscription account."
  - Button: `Set up & subscribe` → progress: `Setting up (1/2)…` →
    `Subscribing (2/2)…`
- Returning subscriber: single `Subscribe for $0.50/day`.
- Success: **"Subscribed."** "First payment collects at the start of each
  period. Manage it right here, anytime."
- Cancel section: quiet button `Cancel subscription` — helper: "Takes
  effect at the end of your current paid period — you keep what you paid
  for, and nothing collects after."
- Cancelled: "Cancellation confirmed on-chain. No further payments can be
  collected after this period."

---

## 6. Merchant dashboard — `/dashboard`

**Purpose:** the merchant's whole business on one screen. Stats answer
"how am I doing," tabs answer "what do I do next."

**Header:** title **"Merchant dashboard"** + wallet button.
Not connected: "Connect a devnet wallet to run your store."

**Stats cards** (labels): `Settled volume` `In escrow` `Settled`
`Listings` `Subscribers` — In-escrow card sublabel: "waiting on delivery."

**Tab: Listings**
- Form title: "New listing" — fields:
  - `Store name` — "Shown to buyers at checkout."
  - `SKU` — "Unique id, becomes your checkout link: /buy/your-sku"
  - `Title`, `Description (optional)`, `Image URL`
  - `Price (USD)` — "Charged in the stablecoin below."
  - `Delivery window (hours)` — **"Your delivery promise.** If the buyer
    doesn't confirm receipt within this window, they're auto-refunded —
    shorter windows convert better, but only promise what you can ship."
  - `Stablecoin mint` — prefilled; helper: "Devnet demo token. Leave as-is
    unless you know why."
- Button: `Create listing` → `Creating…` → success: "Listing live. Share
  your checkout link: {url} — or [embed it on any site]."
- Listing rows: title · sku · price · status chip. INITIALIZED chip reads
  `LIVE` for merchants (it means "purchasable"), FUNDED reads `PAID —
  DELIVER`, plus SETTLED/REFUNDED.
- Empty: "No listings yet. Your first one takes about a minute."

**Tab: Orders**
- Intro line: "**PAID means deliver now** — the money is locked in escrow
  waiting on you. SETTLED means it's yours."
- Rows: title · sku · price · buyer (short) · status chip → order page.
- Empty: "No orders yet. Share a checkout link to get your first one."

**Tab: Subscriptions**
- Form title: "New subscription plan" — same field voice as listings;
  period select: `Daily / Weekly / Monthly (30d)`.
- Plan rows expand to subscribers; per-subscriber button `Collect` →
  "Collected." / error: "Nothing due yet — this period was already
  collected." (surface API message).
- Note under list: "Collections also run automatically — Collect is the
  manual override, not a chore."

**Tab: Webhook**
- Title: "Webhook" — body: "Get a signed POST whenever an order or
  subscription changes state — no polling. We sign every delivery with a
  secret created the first time you save a URL: verify it server-side."
- Field placeholder: `https://yourstore.com/webhooks/liminal`
- Button: `Save webhook` — success: "Saved. We'll POST signed events to
  this URL from now on."

**Tab: Oracle** (advanced — keep the honest framing)
- Title: "Oracle settlement (advanced)"
- Body: "Name a key you trust to certify deliveries. Orders then settle
  the moment a signed delivery attestation exists — no buyer confirmation
  needed. This registers the trusted key only; wiring a real attestor
  (e.g. a Switchboard Function) is a separate step — see the setup guide."
- Buttons: `Check` / `Set oracle config` — status lines: "Configured —
  trusted oracle {short key}" / "Not configured for this mint yet."

---

## 7. Embed — `/embed`

**Purpose:** merchant developer page. Copy exists in-app; keep:
headline **"Sell anywhere with one script tag,"** the paste-ready
snippet, attribute notes, and the live demo button labeled as such:
"Live demo — this is the real embed script running."

---

## 8. Mobile confirmation (deeplink checkout finish)

The plain HTML page after Phantom signing. Keep to three lines:
**"Payment protected."** · "Your order is in escrow — the seller pays out
only on confirmed delivery." · `View on Explorer`. Failure:
**"Nothing was charged."** · "You declined in Phantom — safe to close."

---

## Global patterns

- **Wallet button states:** `Connect wallet` → short address chip.
  Never the word "login" — there are no accounts, that's a feature:
  first-run tooltip: "No sign-up. Your wallet is your account."
- **Loading:** always verb + ellipsis ("Loading orders…", "Sending…").
- **429 rate limit:** "Whoa — too many requests. Give it a minute."
- **Devnet badge** on every page footer: "Devnet — test money. Nothing
  here is real value."
- **Empty states sell the next action**, never apologize ("No listings
  yet. Your first one takes about a minute.")
