import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { createSolanaRpcFromTransport, createDefaultRpcTransport, address } from "@solana/kit";
import { fetchMaybeSubscriptionDelegation } from "@solana/subscriptions";
import { db } from "@/lib/db/client";
import { subscriptionPlans, subscriptionSubscribers } from "@/lib/db/schema";
import { RPC_URL } from "@/lib/solana/program";
import { subscriptionDelegationPda } from "@/lib/solana/subscriptions";

const kitRpc = createSolanaRpcFromTransport(createDefaultRpcTransport({ url: RPC_URL }));

interface SyncBody {
  planId: string;
  subscriber: string;
}

/**
 * Caches a (plan, subscriber) pair once its Subscribe transaction has
 * landed - called by a client after it observes that, since the server
 * never sees wallet-submitted transactions (same reasoning as
 * /api/orders/sync). This cache is what `/api/subscriptions/poll` iterates
 * to know which subscriptions might be due for a collect.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SyncBody | null;
  if (!body?.planId || !body?.subscriber) {
    return NextResponse.json({ message: "planId and subscriber are required" }, { status: 400 });
  }

  let subscriber: PublicKey;
  try {
    subscriber = new PublicKey(body.subscriber);
  } catch {
    return NextResponse.json({ message: "subscriber must be a base58 pubkey" }, { status: 400 });
  }

  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.planId, body.planId),
  });
  if (!plan) {
    return NextResponse.json({ message: `no plan found for planId "${body.planId}"` }, { status: 404 });
  }

  const subscriptionPda = await subscriptionDelegationPda(new PublicKey(plan.planPda), subscriber);
  const onChain = await fetchMaybeSubscriptionDelegation(kitRpc, address(subscriptionPda.toBase58()));
  if (!onChain.exists) {
    return NextResponse.json({ message: "no subscription found on-chain for this plan and subscriber" }, { status: 404 });
  }

  const existing = await db.query.subscriptionSubscribers.findFirst({
    where: eq(subscriptionSubscribers.subscriptionPda, subscriptionPda.toBase58()),
  });
  if (!existing) {
    await db.insert(subscriptionSubscribers).values({
      planId: plan.id,
      subscriberWallet: body.subscriber,
      subscriptionPda: subscriptionPda.toBase58(),
    });
  }

  return NextResponse.json({ subscriptionPda: subscriptionPda.toBase58() });
}
