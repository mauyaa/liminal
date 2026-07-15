# Liminal Protocol

Headless, zero-fee P2P escrow checkout on Solana. A buyer's payment is held
in an on-chain escrow PDA until either the buyer confirms receipt or a
delivery deadline passes, at which point it's automatically refundable.

## Live deployment (devnet)

- App: https://app-eight-lovat-94.vercel.app
- Demo checkout: https://app-eight-lovat-94.vercel.app/buy/liminal-demo-1
- Merchant dashboard: https://app-eight-lovat-94.vercel.app/dashboard
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

**Implemented:** Kamino Lend yield routing on top of the core escrow (see
below).

**Deliberately not implemented yet:** the Switchboard TEE/zkTLS
delivery-oracle settlement path, the mobile interstitial SDK, and the
tokenomics/referral layer. Those integrate with external programs and
services whose real interfaces weren't verified against in this session —
building them against guessed account layouts would be the fastest way to
lose escrowed funds later. The core here is a solid foundation to build them
on incrementally, with each integration verified against the real target
program before it touches real funds.

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
  src/lib/db/schema.ts       merchants / products / orders (Drizzle)
  src/lib/solana/program.ts  PDA derivation + Anchor client helpers
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
