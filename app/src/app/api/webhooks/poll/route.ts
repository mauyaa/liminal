import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { syncOrder } from "@/app/api/orders/sync/route";
import { requireCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Re-syncs every order not yet in a terminal state against on-chain truth,
 * firing a merchant webhook for any whose status changed since the last
 * poll. This is the autonomous half of webhook delivery - `/api/orders/sync`
 * only fires when a client explicitly calls it after observing its own
 * transaction land. Meant to be hit on a schedule (Vercel Cron, GitHub
 * Actions, or any external scheduler) - see README's "Merchant webhooks"
 * section.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const inFlight = await db.query.orders.findMany({
    where: inArray(orders.escrowStatus, ["INITIALIZED", "FUNDED"]),
  });

  let changed = 0;
  const errors: string[] = [];

  for (const order of inFlight) {
    try {
      const result = await syncOrder(order.orderPda);
      if (result?.changed) changed++;
    } catch (err) {
      errors.push(`${order.orderPda}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ checked: inFlight.length, changed, errors });
}
