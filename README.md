# Liminal Protocol

Headless, zero-fee P2P escrow checkout on Solana. A buyer's payment is held
in an on-chain escrow PDA until either the buyer confirms receipt or a
delivery deadline passes, at which point it's automatically refundable.

## Live deployment (devnet)

- App: https://app-eight-lovat-94.vercel.app
- Demo checkout: https://app-eight-lovat-94.vercel.app/buy/liminal-demo-1
- Merchant dashboard: https://app-eight-lovat-94.vercel.app/dashboard
- Agent-discovery catalog: https://app-eight-lovat-94.vercel.app/.well-known/agent-pay
- Program (devnet): `AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD`
- Demo mint (devnet, 6 decimals): `6VKhkPbAPs2esWsQA6BifCLyBuLzPAAuyWUK5TQ3aDQs`

Devnet only — no real funds, no mainnet deployment.

## Scope of this build

This repository implements the **verifiable core** of the protocol:

- An Anchor escrow program (`programs/liminal`) with a real state machine —
  `Initialized → Funded → Settled | Refunded` — and full instruction coverage
  for listing, funding, settling, and timing out an order.
- A Solana Actions/Blinks checkout API and merchant/admin endpoints
  (`app/src/app/api`), backed by a Drizzle/Turso (libSQL) schema.
- A front end on top of that API: a public checkout page and a merchant
  dashboard, both using the Solana wallet adapter to sign transactions
  client-side (the server only ever builds and returns unsigned transactions).

**Implemented:** Kamino Lend yield routing on top of the core escrow, and
recurring billing via the real Solana Foundation Subscriptions program (see
below for both).

**Deliberately not implemented yet:** the Switchboard TEE/zkTLS
delivery-oracle settlement path, gasless/sponsored transactions, the mobile
interstitial SDK, and the tokenomics/referral layer. Those integrate with
external programs and services whose real interfaces weren't verified
against in this session — building them against guessed account layouts
would be the fastest way to lose escrowed funds later. The core here is a
solid foundation to build them on incrementally, with each integration
verified against the real target program before it touches real funds.

## Repository layout

```
programs/liminal/        Anchor program (Rust)
  src/state.rs              UnifiedVault, OrderState, EscrowStatus
  src/kamino.rs              Raw Kamino Lend (klend) CPI helpers - refresh,
                             deposit, redeem
  src/instructions/         initialize_vault, initialize_listing,
                             fund_order, settle_order, refund_order,
                             (+ yield-routing counterparts, see below)
tests/liminal.ts          Anchor integration test suite (mocha, real
                           local-validator, real token transfers)
tests/liminal-yield.ts    Kamino yield-routing tests (mocha, real cloned
                           mainnet Kamino state - see "Kamino yield
                           routing" below, not part of `anchor test`)
app/                      Next.js app: Actions/Blinks API + UI + DB schema
  public/actions.json        Actions routing manifest
  src/app/.well-known/agent-pay/  GET: live agent-commerce discovery
                                    catalog - see "Agent-commerce
                                    discovery" below
  src/app/page.tsx           Landing page
  src/app/buy/[sku]/         Public checkout page (connect wallet, pay)
  src/app/dashboard/         Merchant dashboard (create listings, view orders)
  src/app/api/actions/buy/[sku]/   GET (Blink metadata) + POST (build
                                    the fund_order transaction)
  src/app/api/merchant/listings/   POST: create a listing, get back an
                                    unsigned initialize_listing tx.
                                    GET: list a merchant's listings + status
  src/app/api/admin/vaults/        POST: get back an unsigned
                                    initialize_vault tx (once per mint)
  src/app/api/orders/sync/         POST: re-read on-chain OrderState and
                                    sync the DB row to it
  src/app/api/merchant/plans/      POST: create a subscription plan, get
                                    back an unsigned CreatePlan tx.
                                    GET: list a merchant's plans
  src/app/api/merchant/plans/[planId]/collect/  POST: unsigned
                                    TransferSubscription (pull a period's
                                    payment) tx for the merchant/puller
  src/app/api/actions/subscribe/[planId]/  GET (Blink metadata) + POST
                                    (build the InitSubscriptionAuthority
                                    and/or Subscribe transaction, see
                                    "Subscriptions" below)
  src/app/api/subscriptions/[planId]/cancel/  POST: unsigned
                                    CancelSubscription tx for the subscriber
  src/app/api/subscriptions/sync/  POST: caches a (plan, subscriber) pair
                                    once its Subscribe tx has landed
  src/app/api/subscriptions/poll/  GET: autonomously collects due
                                    subscription payments - see
                                    "Subscriptions" below
  src/app/api/relay/submit/        POST: countersigns + broadcasts a
                                    pre-approved sponsored (gasless) tx -
                                    see "Gasless checkout" below
  src/app/api/merchant/webhook/    POST: set/update a merchant's webhook URL
  src/app/api/webhooks/poll/       GET: autonomously re-syncs in-flight
                                    orders and fires webhooks for changes -
                                    see "Merchant webhooks" below
  src/lib/db/schema.ts       merchants / products / orders / subscriptionPlans
                              / subscriptionSubscribers / sponsoredTransactions
                              (Drizzle)
  src/lib/solana/program.ts  PDA derivation + Anchor client helpers
  src/lib/solana/relayer.ts  Relayer keypair + message-hash helpers for
                              gasless checkout, see "Gasless checkout" below
  src/lib/webhooks.ts        Signed webhook delivery with retries, see
                              "Merchant webhooks" below
  src/lib/solana/subscriptions.ts  Bridges the `@solana/kit`-based
                              `@solana/subscriptions` SDK into plain
                              `@solana/web3.js` types - see "Subscriptions"
                              below
  src/lib/solana/wallet-provider.tsx  Wallet adapter context (Phantom/Solflare, devnet)
  src/lib/solana/idl/        copied from target/idl + target/types after
                              `anchor build` — regenerate after program
                              changes, don't hand-edit
```

## On-chain design

Two PDA families, matching the escrow model:

- `UnifiedVault` — `["liminal-vault", mint]`. One custody token account per
  accepted stablecoin mint; created once via `initialize_vault`.
- `OrderState` — `["order-state", seller, market_item_id]`. One per listing.

By default (`initialize_vault`), 100% of a funded order's principal sits in
the vault's token account until settlement or refund — no CPI into any
lending protocol. A vault can instead be created with `initialize_vault_yield`
to route a share of every funded order into Kamino Lend for the life of the
order; see "Kamino yield routing" below.

## Kamino yield routing

A yield-enabled vault (`initialize_vault_yield`) is the on-chain mechanism
behind the "0% fee, funded by yield" model: instead of the protocol charging
a fee, a funded order's principal earns lending yield for the time it sits
in escrow, and that yield is what would fund the protocol rather than a cut
of the buyer's or seller's money.

**What it does:**

- `fund_order_yield` splits an order's principal `YIELD_BPS` (75%) /
  remainder (25%) — 75% is deposited into a real Kamino Lend reserve via
  `deposit_reserve_liquidity`, 25% stays liquid in the vault's own token
  account as an immediately-available buffer. The kTokens received are held
  in a per-order PDA token account (`["order-ktoken", seller, market_item_id]`)
  so each order's position is independently tracked and redeemed.
- `settle_order_yield` / `refund_order_yield` call `refresh_reserve` then
  `redeem_reserve_collateral` to redeem exactly that order's kTokens back to
  the vault, add the redeemed amount to the 25% buffer, and pay out the
  total (principal plus any accrued yield) to the seller or buyer
  respectively. The payout is computed as a balance delta on the vault's
  token account across the redeem CPI, not a locally-replicated exchange
  rate, so it's exactly what Kamino actually returns.
- All four Kamino account addresses that matter (program, reserve, lending
  market, lending market authority) are pinned into the `UnifiedVault` at
  creation and re-checked with `#[account(address = ...)]` constraints on
  every subsequent instruction, so a yield-enabled vault can't be pointed at
  a different reserve after the fact.

**How this was verified — real state, not guessed layouts.** Kamino's
program isn't meaningfully deployed on devnet, and CPI code that moves
escrowed funds shouldn't be written against assumed account layouts. So the
integration was built and tested against actual mainnet Kamino state:

- Kamino's raw `deposit_reserve_liquidity` / `redeem_reserve_collateral` /
  `refresh_reserve` instruction layouts, discriminators, and account orders
  were confirmed against Kamino's own published source, not inferred.
- All addresses baked into the vault config are real, verified mainnet
  values (klend program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`, the
  SOL/BTC/main market, its USDC reserve and sub-accounts, the Scope price
  oracle) — decoded directly from live on-chain account data, not copied
  from documentation.
- The integration test suite (`tests/liminal-yield.ts`) runs against a
  local `solana-test-validator` with the real klend program and its real
  reserve/market/oracle accounts cloned in from mainnet
  (`--clone-upgradeable-program` for the program itself, so its
  `ProgramData` is included and it actually executes; `--warp-slot` to
  align the local clock with the cloned reserve's on-chain state so
  Kamino's own interest-accrual math doesn't underflow), plus a real USDC
  mint with its mint authority reassigned locally so the test can fund
  accounts.
- Two real bugs were found and fixed this way (not in mocked tests):
  Kamino's own `redeem_reserve_collateral` requires the destination
  liquidity account and the source collateral account to share the same SPL
  `authority`, which the vault design didn't originally satisfy; and a
  `CloseAccount` CPI destination needs to be `mut` at the outer instruction
  level, which was initially missing on `settle_order_yield`'s `buyer`
  account and only surfaced as a "writable privilege escalated" runtime
  error under a real CPI, not in unit-level review.

**Scope note:** yield-enabled vaults are opt-in — existing vaults created
with `initialize_vault` are untouched (`yield_enabled` defaults `false`, and
every yield instruction checks it). This is implemented and tested against
real cloned mainnet Kamino state but has not been deployed anywhere with
real funds; the devnet deployment above still runs the original
non-yield-routing instructions only, since Kamino has no meaningful devnet
deployment to exercise against. The Next.js API layer does not yet expose
`initialize_vault_yield` / the yield-routing instructions — only the Anchor
program and its test suite demonstrate the call pattern so far.

Run the yield test suite separately from the core suite (it needs the
mainnet-cloned validator setup above, not a plain `solana-test-validator`):

```bash
anchor test --script test-yield
```

## Subscriptions

Recurring billing (merchant-published plans, buyer-approved allowances,
periodic pulls) is wired against the real, audited Solana Foundation
**Subscriptions & Allowances** program
(`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`, live on mainnet and devnet
since June 2026) rather than a hand-rolled delegation scheme in `liminal`
itself. This is a deliberate design choice, not just a shortcut: a
recurring-pull delegation system is itself security-critical (it grants a
third party standing SPL approval over a user's tokens), and the Solana
Foundation's program is already audited (Cantina/Spearbit) and live -
re-implementing and re-auditing the same primitive inside this repo would
be worse, not more thorough. `liminal`'s own escrow program is untouched by
this; the Next.js API layer just builds transactions that target the
external program directly, the same way it already builds transactions
targeting `liminal` itself.

**How it works:**

- A merchant calls `POST /api/merchant/plans` to publish a plan (price,
  billing period, payout destination) via the program's `CreatePlan`
  instruction. The plan's on-chain `plan_id` is the row's own DB id, cached
  locally the same way listings cache `market_item_id`.
- A buyer subscribes through `GET`/`POST /api/actions/subscribe/[planId]`
  (a Solana Actions/Blink endpoint, same shape as the checkout flow). This
  is a **two-step** flow for a first-time subscriber: the first `POST`
  returns an `InitSubscriptionAuthority` transaction (approves the
  program's per-mint delegate PDA for `u64::MAX`, standard for this
  program - the PDA still can't move funds outside what an active
  delegation explicitly authorizes); once that lands, the caller `POST`s
  the same endpoint again and gets back the real `Subscribe` transaction,
  bound to the plan's live on-chain terms (never a cached copy - a merchant
  can update a plan after it was cached, and the program's own
  `PlanTermsMismatch` check exists precisely to catch a subscriber signing
  against stale terms). The response's `requiresFollowUp` field tells the
  caller which step it just got.
- `POST /api/merchant/plans/[planId]/collect` builds a `TransferSubscription`
  pulling one period's payment; `POST /api/subscriptions/[planId]/cancel`
  builds a `CancelSubscription`. Both bind to live on-chain state, not a
  cache, for the same reason as subscribe.

**Bridging two Solana JS stacks.** The official SDK
(`@solana/subscriptions`) is a `@solana/kit` plugin, while the rest of this
app is built on the older `@solana/web3.js` v1 (`@coral-xyz/anchor`,
`@solana/wallet-adapter-react`). Rather than rewriting the app onto `kit`,
`src/lib/solana/subscriptions.ts` is the single place both stacks touch:
every exported function takes/returns plain `web3.js` `PublicKey` /
`TransactionInstruction` types, converting to/from `kit`'s types
internally (a `createNoopSigner` stand-in mirrors `program.ts`'s existing
read-only Anchor wallet stub - the server only ever builds unsigned
transactions, never signs). `@solana/kit` is pinned to `^6.10.0` to match
what `@solana/subscriptions` actually peers against and was tested
against, not whatever is newest.

**How this was verified — real devnet, not guesses, and it caught a real
bug.** Unlike Kamino, this program has a meaningful devnet deployment, so
the full lifecycle was run against it directly: create a plan, initialize a
subscription authority, subscribe, collect a period's payment, attempt (and
correctly get rejected for) a second collect within the same billing
period, cancel, and confirm the plan shows up in the merchant's listing —
all against real transactions on `api.devnet.solana.com`, decoded from the
program's real account layouts and instruction discriminators, not
documentation. This caught a real design bug before it shipped: the first
implementation bundled `InitSubscriptionAuthority` and `Subscribe` in one
transaction using the program's `UNKNOWN_INIT_ID` "same-slot" sentinel
(meant to let a first-time subscriber sign once instead of twice) - that
was rejected on-chain by the live devnet deployment with a
`StaleSubscriptionAuthority` error every time, for reasons not fully
resolved against the cloned source. Rather than keep debugging a shortcut
against unverified behavior of the exact deployed build, the design was
changed to always bind `Subscribe` to a concrete, already-confirmed
`init_id` read back from chain - the two-step flow described above - which
is what was actually confirmed to work.

**Scope note:** this is a simplified two-call pattern for a first-time
subscriber, not full sRFC-32 action-chaining (`links.next`) - a caller
needs to know to re-POST after the first transaction lands, communicated
via the `requiresFollowUp` response field rather than an inline next-action
link. No mainnet deployment.

**Automated billing pulls.** `POST /api/merchant/plans/[planId]/collect` is
still there for a manually-triggered pull, but real recurring billing needs
an automated puller - the program's own design assumes one, with `pullers`
existing specifically so an address *other than* the merchant can be
authorized to pull on their behalf. This repo wires that up rather than
leaving it manual-only:

- `POST /api/merchant/plans` registers the relayer keypair (the same one
  gasless checkout uses, see "Gasless checkout" below) as an additional
  `puller` on the plan at creation time, alongside the merchant. Degrades
  gracefully to merchant-only pulling if no relayer is configured.
- `POST /api/subscriptions/sync` caches a (plan, subscriber) pair once a
  Subscribe transaction lands, the same "client tells the server what it
  observed" pattern `/api/orders/sync` already uses.
- `GET /api/subscriptions/poll` is the actual automation: for every cached
  subscription, it reads the subscription's live on-chain state to check
  whether it's actually due (comparing `currentPeriodStartTs` +
  `periodHours` and `amountPulledInPeriod` against now - a cheap precheck,
  not a replacement for the on-chain program's own enforcement, which still
  runs on every attempt), and for anything due, builds, signs, and submits
  a `TransferSubscription` fully server-side with the relayer as `caller` -
  no merchant or subscriber signature needed at collection time at all.
  Meant to be hit on a schedule, same as `/api/webhooks/poll`.

**How this was verified.** A real devnet run with the relayer as a
*separate* keypair from the merchant (funded independently) - deliberately
not the same wallet, since that would trivially pass the plan's `can_pull`
check regardless of whether the `pullers` wiring actually worked. Created a
plan, subscribed, synced, then called `/api/subscriptions/poll` with zero
further interaction from either the merchant or the subscriber: it
correctly identified the first period's payment as due and collected it -
confirmed by the subscriber's token balance actually decreasing - and a
second immediate poll correctly skipped it as not yet due.

**On cancellation timing** (this needed checking directly against the
program's real source, since two different pieces of reference material
disagreed on it): `CancelSubscription` does **not** block pulls
immediately. It sets `expires_at_ts` to the end of the subscriber's
*current already-paid-for* billing period - the merchant can still collect
through that boundary, and only pulls attempted after it are rejected
(`SubscriptionCancelled`). Confirmed by reading `cancel_subscription.rs`
and `transfer_subscription.rs` directly rather than trusting either
secondary description.

## Gasless checkout

A buyer with **zero SOL** can still complete a checkout: the Actions
endpoint has a sponsored mode where a relayer keypair pays the network fee
(and any ATA rent) and is reimbursed in the mint's own token, the same
mechanic Octane/Kora-style relayers use. This isn't a wrapper around the
Kora binary - it's a small, self-contained implementation of the same
mechanic, since what Liminal needs (sponsor one specific pre-approved
transaction, get repaid in-band) doesn't need a standalone relayer service.

**How it works:**

- `GET /api/actions/buy/[sku]` now lists two actions: the normal
  buyer-pays-fees checkout, and a second one hitting
  `?sponsored=true`.
- In sponsored mode, the server builds the transaction with the relayer as
  `feePayer` (so it - not the buyer - pays for both the buyer's ATA
  creation and the transaction fee), appends a flat-fee token transfer from
  the buyer's ATA to the relayer's ATA (`RELAYER_FEE_BASE_UNITS`, $0.01 at
  6 decimals - a deliberately simple flat fee, not a cost-plus
  calculation), and records a hash of the transaction's compiled message in
  `sponsoredTransactions` with a 2-minute expiry - a pre-approval record,
  not a signature.
- The buyer's wallet partially signs (authorizing the escrow deposit and
  the fee transfer - it never touches SOL) and posts the result to
  `POST /api/relay/submit`, whose response the checkout call already
  pointed at (`relaySubmitUrl`). That endpoint only ever countersigns and
  broadcasts a transaction whose message hash matches an unexpired,
  not-yet-consumed pre-approval record for its own pubkey - never an
  arbitrary transaction handed to it - and marks the record consumed
  before broadcasting, so the same approval can't be replayed.

**How this was verified.** A full devnet run with a freshly generated
buyer keypair holding *exactly* zero SOL: minted it some devnet USDC (rent
for its ATA paid by the test setup, not the buyer, mirroring a real
on-ramp), ran the sponsored checkout end to end, and confirmed the buyer's
SOL balance was still exactly zero afterward, its token balance reflects
the order price plus the flat relayer fee, and that replaying the same
signed transaction against `/api/relay/submit` a second time is rejected.

**Scope notes:**
- This is opt-in per request (`?sponsored=true`), not the default -
  existing checkout behavior is unchanged.
- `RELAYER_SECRET_KEY` is a raw JSON-array secret key read from an env var
  for this pass. That's fine for devnet; a real deployment moving real
  money should not hold a live signing key in a plain env var - swap this
  for a KMS or Kora-backed signer (see `src/lib/solana/relayer.ts`, which
  is the one place that would need to change).
- There's no rate-limiting or abuse protection on who can request
  sponsorship - a production deployment needs that in front of this before
  going live, since the relayer's SOL balance is otherwise an open target.
- A generic Blink-rendering wallet won't automatically know to call
  `relaySubmitUrl` - that's a custom field, not part of the Actions spec.
  This is built for a caller (this repo's own frontend, or another client)
  that knows to look for it, not for arbitrary wallet UIs out of the box.

## Merchant webhooks

A merchant can register a URL to be notified when one of their orders
changes state (`order.initialized` / `order.funded` / `order.settled` /
`order.refunded`), instead of having to poll the API themselves.

**How it works:**

- `POST /api/merchant/webhook` sets (or updates) a merchant's webhook URL.
  The first time a merchant configures one, a signing secret is generated
  and returned - stable across later URL updates, so existing
  signature-verification code on the merchant's side doesn't break when
  they change the endpoint.
- Delivery is signed the same way Stripe/GitHub webhooks are: an
  `X-Liminal-Signature` header carrying the hex HMAC-SHA256 of the raw JSON
  body, keyed by the merchant's secret. `src/lib/webhooks.ts` retries a
  failed delivery up to 3 times with backoff (0s / 2s / 5s) and never
  throws - a merchant's endpoint being down doesn't fail the caller's
  request.
- There are two ways a webhook actually gets sent, both funneling through
  the same `syncOrder` helper in `src/app/api/orders/sync/route.ts` so the
  change-detection and delivery logic only exists once:
  - **Client-triggered**: `POST /api/orders/sync` (already existed for
    syncing the DB after a client observes its own transaction land) now
    also fires the webhook if the freshly-read on-chain status differs
    from what was cached.
  - **Autonomous**: `GET /api/webhooks/poll` re-syncs every order not yet
    in a terminal state and fires webhooks for any that changed since the
    last check - this is what actually makes delivery not depend on a
    client happening to call sync. It's meant to be hit on a schedule
    (Vercel Cron, a GitHub Actions cron workflow, or any external pinger)
    rather than run continuously, since this is a serverless deployment
    with no long-lived process to run a persistent indexer in.

**How this was verified.** A real devnet run: registered a local HTTP
receiver as a merchant's webhook, funded a real order, called `/sync` and
confirmed a correctly-signed `order.funded` payload arrived; confirmed a
second `/poll` call with nothing changed reports zero and doesn't re-fire;
then settled the same order on-chain *without* ever calling `/sync`, called
`/poll`, and confirmed it autonomously detected the change and delivered a
correctly-signed `order.settled` payload - the actual autonomous path, not
just the client-triggered one.

**Scope notes:**
- No dedicated on-chain event indexer (log/websocket subscriptions) - this
  is polling-based, which is what actually fits a serverless deployment
  with no persistent process. Fine at this scale; a high-volume production
  deployment would want a real indexer instead of polling every order.
- `/api/webhooks/poll` isn't wired to an actual scheduler in this repo (no
  `vercel.json` cron config was added) - that's a deployment decision, not
  a code one, left for whoever operates this to wire up.
- Both `/api/webhooks/poll` and `/api/subscriptions/poll` are gated behind
  `CRON_SECRET` (see `src/lib/cron-auth.ts`) - open by default for local
  dev, but set it in production so these can't be called by anyone who
  finds the URL. Vercel Cron sends the matching `Authorization: Bearer`
  header automatically when the env var is set, so wiring a `vercel.json`
  cron entry to either endpoint needs no extra plumbing.

## Agent-commerce discovery

`GET /.well-known/agent-pay` is a live, machine-readable catalog of every
active listing and subscription plan across all merchants, each with the
real Actions endpoint that executes it. Both merchant-facing reference
documents reviewed during this build named an agent-discovery manifest as
speculative future work ("AI procurement agents... over Liminal's headless
payment network") rather than something actually built - this is a real,
present-day implementation of that idea instead of a placeholder for it.

It's deliberately just a catalog index, not a new transaction protocol: an
automated client (an AI purchasing agent, a price-comparison bot, or a
plain script) that can already build and sign a Solana transaction from a
Solana Actions POST response needs nothing beyond what's already
documented above (`actions.json` + the Actions spec) - this only solves
*discovery* of what's for sale, at what price, and where to check out,
without requiring out-of-band knowledge of specific SKUs or plan ids.

Reads directly from the same DB the checkout flow itself uses (verified
against the live production deployment, not a mock), so it can't drift out
of sync with what's actually purchasable.

## Prerequisites

- Rust + Solana CLI + Anchor CLI (this was developed against Anchor 1.1.2 /
  Agave 4.0.2 inside WSL2 — Solana/Anchor tooling is unreliable on native
  Windows)
- Node.js 20+, npm (for the Anchor test suite) and pnpm (for `app/`)

## Running things

```bash
# On-chain program: build + full integration test suite
anchor build
anchor test --validator legacy   # this Anchor version defaults to a
                                  # `surfpool` validator backend that isn't
                                  # installed here; --validator legacy uses
                                  # the standard solana-test-validator

# Web app
cd app
pnpm install
cp .env.example .env.local       # defaults to a local sqlite file
npx drizzle-kit migrate
pnpm dev
```

`app/.env.example` documents `DATABASE_URL` (local sqlite by default, point
it at a Turso `libsql://` URL for production), `DATABASE_AUTH_TOKEN`, and
`SOLANA_RPC_URL`. `drizzle.config.ts` loads `.env.local` explicitly (the
drizzle-kit CLI doesn't auto-load it the way Next.js does), so `drizzle-kit`
commands pick up the same env as `next dev`.

Deployed to Vercel with `DATABASE_URL`/`DATABASE_AUTH_TOKEN` pointing at a
Turso database and `SOLANA_RPC_URL=https://api.devnet.solana.com`.

## Verification performed

- `anchor test`: 6/6 passing — full lifecycle, double-settle rejection,
  wrong-signer rejection, premature-refund rejection, timeout refund.
- `tsc --noEmit`, `eslint .`, and `next build` clean in `app/`.
- A live end-to-end pass driving the actual HTTP API against a running
  local validator: initialize a vault, create a listing, fetch Blink
  metadata, fund an order through the Actions endpoint, and confirm the DB
  synced to the on-chain `Funded` status.
- Deployed the program to devnet, initialized a real vault and listing
  against the live Vercel deployment + Turso DB, and confirmed the
  Actions API builds valid, landable devnet transactions in production.
- `/buy/[sku]` and `/dashboard` checked in-browser (rendered content,
  wallet-connect button, no console errors) — the actual wallet-signing
  flow wasn't click-tested end-to-end since the check ran without a real
  Phantom/Solflare browser extension installed.
- `anchor test --script test-yield`: 3/3 passing against a validator with
  real mainnet Kamino state cloned in — routes 75% of a funded order into
  the real reserve, redeems and pays out principal + accrued yield on
  settle, and does the same on a timed-out refund. See "Kamino yield
  routing" above for the full methodology. Re-ran the core `anchor test`
  suite afterward and confirmed 6/6 still passing — zero regression from
  the yield-routing additions.
- Subscriptions: a full live lifecycle test against the real program on
  devnet — create plan, init subscription authority, subscribe, collect,
  a same-period double-collect correctly rejected on-chain, cancel, and a
  merchant plan-listing check — all via real HTTP calls to a local dev
  server backed by a throwaway local DB (not the production Turso
  database) and real devnet transactions. See "Subscriptions" above.
- Automated subscription billing: a real devnet run with the relayer as a
  keypair genuinely separate from the merchant — created a plan, subscribed,
  synced, then called `/api/subscriptions/poll` with no further merchant or
  subscriber interaction at all; confirmed it correctly identified the first
  period's payment as due and collected it (subscriber's token balance
  actually decreased), and that an immediate second poll correctly skipped
  it as not yet due. See "Subscriptions" above.
- Gasless checkout: a real devnet run with a freshly generated buyer
  keypair holding exactly zero SOL — sponsored checkout completed, the
  buyer's SOL balance confirmed still exactly zero afterward, its token
  balance confirmed reflecting the order price plus the flat relayer fee,
  and replaying an already-consumed sponsorship against `/api/relay/submit`
  confirmed rejected. See "Gasless checkout" above.
- Merchant webhooks: a real devnet run — funded a real order and confirmed
  a correctly-signed `order.funded` webhook via `/api/orders/sync`;
  confirmed `/api/webhooks/poll` reports zero changes and doesn't re-fire
  when nothing changed; then settled the same order on-chain *without*
  calling `/sync`, called `/poll`, and confirmed it autonomously detected
  the change and delivered a correctly-signed `order.settled` webhook. See
  "Merchant webhooks" above.
- All of the above, plus the agent-discovery manifest, confirmed working
  against the actual live production deployment (not just local dev) after
  redeploying - `GET /.well-known/agent-pay` returns the real current demo
  listing with correct checkout URLs, `/api/merchant/plans` and
  `/api/webhooks/poll` correctly hit the production Turso DB, and
  `/api/subscriptions/poll` correctly reports itself as unconfigured
  (`RELAYER_SECRET_KEY` isn't set in production) instead of erroring.
