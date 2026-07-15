import { createHmac, randomBytes } from "node:crypto";
import type { EscrowStatus } from "@/lib/db/schema";

const EVENT_BY_STATUS: Record<EscrowStatus, string> = {
  INITIALIZED: "order.initialized",
  FUNDED: "order.funded",
  SETTLED: "order.settled",
  REFUNDED: "order.refunded",
};

const RETRY_DELAYS_MS = [0, 2_000, 5_000];
const REQUEST_TIMEOUT_MS = 10_000;

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export interface OrderWebhookPayload {
  orderPda: string;
  sku: string;
  escrowStatus: EscrowStatus;
  buyerWallet: string | null;
  priceUsdc: number;
  mint: string;
}

/**
 * Delivers a signed webhook to a merchant's configured URL with retries and
 * exponential backoff. Never throws - a merchant's endpoint being down
 * doesn't fail the caller's request; it just logs and gives up after the
 * last attempt. The signature (`X-Liminal-Signature`, hex HMAC-SHA256 of
 * the raw JSON body) lets the merchant verify the payload actually came
 * from here, the same pattern Stripe/GitHub webhooks use.
 */
export async function deliverOrderWebhook(
  webhookUrl: string,
  webhookSecret: string,
  payload: OrderWebhookPayload
): Promise<void> {
  const body = JSON.stringify({
    event: EVENT_BY_STATUS[payload.escrowStatus],
    timestamp: new Date().toISOString(),
    data: payload,
  });
  const signature = signPayload(webhookSecret, body);

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Liminal-Signature": signature,
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        console.log(`webhook delivered: ${payload.orderPda} -> ${webhookUrl} (attempt ${attempt + 1})`);
        return;
      }
      console.warn(`webhook attempt ${attempt + 1} failed: ${payload.orderPda} -> ${webhookUrl} (HTTP ${response.status})`);
    } catch (err) {
      console.warn(`webhook attempt ${attempt + 1} errored: ${payload.orderPda} -> ${webhookUrl}`, err);
    }
  }

  console.error(`webhook delivery gave up after ${RETRY_DELAYS_MS.length} attempts: ${payload.orderPda} -> ${webhookUrl}`);
}
