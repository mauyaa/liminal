import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptionPlans, merchants } from "@/lib/db/schema";
import { buildUnsignedTransaction, getConnection } from "@/lib/solana/program";
import { cancelSubscriptionIx } from "@/lib/solana/subscriptions";

interface CancelBody {
  subscriber: string;
}

async function findPlan(planId: string) {
  return db
    .select({
      planId: subscriptionPlans.planId,
      merchantWallet: merchants.wallet,
    })
    .from(subscriptionPlans)
    .innerJoin(merchants, eq(subscriptionPlans.merchantId, merchants.id))
    .where(eq(subscriptionPlans.planId, planId))
    .then((rows) => rows[0]);
}

/**
 * Builds an unsigned `CancelSubscription` transaction for the subscriber's
 * wallet to sign. Cancellation takes effect at the end of the current
 * billing period (a grace period), not immediately - the program's own
 * behavior, not something this route enforces.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;
  const plan = await findPlan(planId);
  if (!plan) {
    return NextResponse.json({ message: `no plan found for planId "${planId}"` }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as CancelBody | null;
  if (!body?.subscriber) {
    return NextResponse.json({ message: "subscriber is required" }, { status: 400 });
  }

  let subscriber: PublicKey;
  try {
    subscriber = new PublicKey(body.subscriber);
  } catch {
    return NextResponse.json({ message: "subscriber must be a base58 pubkey" }, { status: 400 });
  }

  const ix = await cancelSubscriptionIx({
    subscriber,
    merchant: new PublicKey(plan.merchantWallet),
    planId: BigInt(plan.planId),
  });

  const connection = getConnection();
  const transaction = await buildUnsignedTransaction(connection, subscriber, [ix]);

  return NextResponse.json({ transaction });
}
