import { NextRequest, NextResponse } from "next/server";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptionPlans, merchants } from "@/lib/db/schema";
import { buildUnsignedTransaction, getConnection } from "@/lib/solana/program";
import { collectSubscriptionIx } from "@/lib/solana/subscriptions";

interface CollectBody {
  caller: string;
  subscriber: string;
  receiverAta?: string;
}

async function findPlan(planId: string) {
  return db
    .select({
      planId: subscriptionPlans.planId,
      mint: subscriptionPlans.mint,
      merchantWallet: merchants.wallet,
    })
    .from(subscriptionPlans)
    .innerJoin(merchants, eq(subscriptionPlans.merchantId, merchants.id))
    .where(eq(subscriptionPlans.planId, planId))
    .then((rows) => rows[0]);
}

/**
 * Builds an unsigned `TransferSubscription` (collect) transaction, pulling
 * one period's payment from a subscriber into `receiverAta` (defaulting to
 * the caller's own ATA for the plan's mint). `caller` must sign - the
 * on-chain program itself enforces that they're the plan owner or a
 * registered puller, and that `receiverAta`'s owner is a registered
 * destination.
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

  const body = (await request.json().catch(() => null)) as CollectBody | null;
  if (!body?.caller || !body?.subscriber) {
    return NextResponse.json({ message: "caller and subscriber are required" }, { status: 400 });
  }

  let caller: PublicKey;
  let subscriber: PublicKey;
  let receiverAta: PublicKey | undefined;
  const mint = new PublicKey(plan.mint);
  try {
    caller = new PublicKey(body.caller);
    subscriber = new PublicKey(body.subscriber);
    receiverAta = body.receiverAta ? new PublicKey(body.receiverAta) : undefined;
  } catch {
    return NextResponse.json({ message: "caller, subscriber, and receiverAta must be base58 pubkeys" }, { status: 400 });
  }

  const instructions: TransactionInstruction[] = [];

  // Only auto-create when defaulting to the caller's own ATA - we know its
  // owner in that case. A caller-supplied receiverAta is their responsibility.
  if (!receiverAta) {
    receiverAta = getAssociatedTokenAddressSync(mint, caller);
    instructions.push(createAssociatedTokenAccountIdempotentInstruction(caller, receiverAta, caller, mint));
  }

  instructions.push(
    await collectSubscriptionIx({
      caller,
      subscriber,
      merchant: new PublicKey(plan.merchantWallet),
      planId: BigInt(plan.planId),
      receiverAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
  );

  const connection = getConnection();
  const transaction = await buildUnsignedTransaction(connection, caller, instructions);

  return NextResponse.json({ transaction });
}
