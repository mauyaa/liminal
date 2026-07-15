import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchants, orders, products, subscriptionPlans, subscriptionSubscribers } from "@/lib/db/schema";
import { ESCROW_STATUSES } from "@/lib/db/schema";

/**
 * Aggregate dashboard numbers for one merchant: order counts by status,
 * settled volume, listing/plan/subscriber counts. Pure DB reads - the
 * per-order rows are already kept in sync with on-chain state by
 * /api/orders/sync and the pollers, so this doesn't re-fetch the chain.
 */
export async function GET(request: NextRequest) {
  const merchantWallet = request.nextUrl.searchParams.get("merchantWallet");
  if (!merchantWallet) {
    return NextResponse.json({ message: "merchantWallet query param is required" }, { status: 400 });
  }

  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, merchantWallet),
  });
  if (!merchant) {
    return NextResponse.json({
      listings: 0,
      ordersByStatus: Object.fromEntries(ESCROW_STATUSES.map((s) => [s, 0])),
      settledVolumeBaseUnits: 0,
      subscriptionPlans: 0,
      subscribers: 0,
    });
  }

  const [listingCount] = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.merchantId, merchant.id));

  const statusRows = await db
    .select({ status: orders.escrowStatus, value: count() })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(products.merchantId, merchant.id))
    .groupBy(orders.escrowStatus);

  const ordersByStatus = Object.fromEntries(ESCROW_STATUSES.map((s) => [s, 0]));
  for (const row of statusRows) ordersByStatus[row.status] = row.value;

  const [settled] = await db
    .select({ value: sum(products.priceUsdc) })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(eq(products.merchantId, merchant.id), eq(orders.escrowStatus, "SETTLED")));

  const [planCount] = await db
    .select({ value: count() })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.merchantId, merchant.id));

  const [subscriberCount] = await db
    .select({ value: count() })
    .from(subscriptionSubscribers)
    .innerJoin(subscriptionPlans, eq(subscriptionSubscribers.planId, subscriptionPlans.id))
    .where(eq(subscriptionPlans.merchantId, merchant.id));

  return NextResponse.json({
    listings: listingCount.value,
    ordersByStatus,
    settledVolumeBaseUnits: Number(settled.value ?? 0),
    subscriptionPlans: planCount.value,
    subscribers: subscriberCount.value,
  });
}
