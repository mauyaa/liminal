# External setup guide

Four integrations are code-complete in this repo but need an account only
you can create. Each section is copy-paste-ready.

Production base URL: `https://app-eight-lovat-94.vercel.app`

---

## 1. Telegram bot (~5 minutes)

The webhook handler (`/api/telegram/webhook`) is live and answers
`/buy <sku>` with a checkout button. It just needs a real bot token.

1. In Telegram, message **@BotFather** → send `/newbot` → pick a name and a
   username. BotFather replies with a token like `1234567890:AAF...`.
2. Point the bot's webhook at the deployed handler (replace `<TOKEN>`):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://app-eight-lovat-94.vercel.app/api/telegram/webhook"
   ```

3. Add the token to Vercel (Settings → Environment Variables →
   `TELEGRAM_BOT_TOKEN`, Production) and redeploy.
4. Test: DM your bot `/buy liminal-demo-1` — it replies with a checkout
   button into the Phantom deeplink flow.

## 2. Dialect Blinks registry (unlocks rendering inside X posts)

The Actions endpoints and `actions.json` are live and spec-compliant.
Registration makes wallets/clients render your links as Blinks in feeds.

1. Go to `https://terminal.dial.to` and sign in (wallet-based).
2. Submit the action URL for review:
   `https://app-eight-lovat-94.vercel.app/api/actions/buy/liminal-demo-1`
3. Once approved, posting `https://app-eight-lovat-94.vercel.app/buy/liminal-demo-1`
   on X renders the checkout inline (via `actions.json`'s path mapping).

Note: registries typically only list **mainnet** actions - treat this as a
mainnet-launch item. (At the time of writing, Dialect's own dial.to
interstitial was down - "deployment paused by owner" - so re-check their
current submission flow when you do this.)

## 3. Switchboard Function (automated delivery attestation)

The on-chain verification (`settle_order_with_oracle`) is deployed and
tested; what's missing is the real attestor that watches deliveries and
signs `orderPda || "DELIVERED"`.

1. Decide the delivery source of truth (carrier tracking API, fulfillment
   webhook, download-completed event - this determines the Function code).
2. Create a Switchboard account and follow their Functions quickstart:
   `https://docs.switchboard.xyz` → Functions. You'll write a small
   TypeScript/Rust job that (a) checks your delivery source, (b) on
   confirmed delivery, signs the 41-byte message `orderPda || "DELIVERED"`
   with the enclave key and submits the Ed25519 + `settle_order_with_oracle`
   transaction.
3. Fund the Function's escrow (their fee model) and note its **enclave
   pubkey**.
4. Register it as trusted: dashboard → Oracle tab → paste the enclave
   pubkey → sign. (One-time per mint.)

Until then, the same instruction works with any key you control as a
manual "admin attests delivery" fallback.

## 4. Helius (real-time indexing instead of polling)

Current webhook delivery polls (`/api/webhooks/poll`). For real-time:

1. Create a free API key at `https://dashboard.helius.dev`.
2. Create a webhook subscription for program
   `AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD` (devnet) pointing at a
   new endpoint (e.g. `/api/helius/webhook` - not yet written; ask for it
   once you have the key, it's a ~50-line route that maps transaction
   events to `syncOrder`).
3. Also worth switching `SOLANA_RPC_URL` to your Helius RPC URL - the
   public devnet RPC rate-limits under load.

## Scheduling the pollers (no account needed - do this anytime)

The three autonomous endpoints run whenever something hits them with the
`CRON_SECRET`. Vercel's Hobby plan allows daily crons; for minute-level
cadence use GitHub Actions (free, in this repo):

```yaml
# .github/workflows/poll.yml
name: pollers
on:
  schedule: [{ cron: "*/5 * * * *" }]
jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - run: |
          for p in webhooks subscriptions refunds; do
            curl -s -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
              "https://app-eight-lovat-94.vercel.app/api/$p/poll"
          done
```

Add `CRON_SECRET` as a GitHub Actions secret (same value as in Vercel).
