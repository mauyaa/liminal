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

**Deliberately not implemented yet:** Kamino yield routing, the Switchboard
TEE/zkTLS delivery-oracle settlement path, the mobile interstitial SDK, and
the tokenomics/referral layer. Those integrate with external programs and
services whose real interfaces weren't verified against in this session —
building them against guessed account layouts would be the fastest way to
lose escrowed funds later. The core here is a solid foundation to build them
on incrementally, with each integration verified against the real target
program before it touches real funds.

## Repository layout

```
programs/liminal/        Anchor program (Rust)
  src/state.rs              UnifiedVault, OrderState, EscrowStatus
  src/instructions/         initialize_vault, initialize_listing,
                             fund_order, settle_order, refund_order
tests/liminal.ts          Anchor integration test suite (mocha, real
                           local-validator, real token transfers)
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

There's no yield routing yet, so 100% of a funded order's principal sits in
the vault's token account until settlement or refund — no CPI into any
lending protocol.

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
