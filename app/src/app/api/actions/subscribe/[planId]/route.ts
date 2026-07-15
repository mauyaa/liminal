import { NextRequest, NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS } from "@solana/actions";
import type { ActionGetResponse, ActionPostRequest, ActionPostResponse } from "@solana/actions";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptionPlans, merchants } from "@/lib/db/schema";
import { buildUnsignedTransaction, getConnection } from "@/lib/solana/program";
import {
  hasSubscriptionAuthority,
  initSubscriptionAuthorityIx,
  planPda,
  subscribeIx,
  subscriptionDelegationPda,
} from "@/lib/solana/subscriptions";

export const runtime = "nodejs";

async function findPlan(planId: string) {
  return db
    .select({
      planId: subscriptionPlans.planId,
      title: subscriptionPlans.title,
      description: subscriptionPlans.description,
      imageUrl: subscriptionPlans.imageUrl,
      amountBaseUnits: subscriptionPlans.amountBaseUnits,
      periodHours: subscriptionPlans.periodHours,
      mint: subscriptionPlans.mint,
      merchantWallet: merchants.wallet,
    })
    .from(subscriptionPlans)
    .innerJoin(merchants, eq(subscriptionPlans.merchantId, merchants.id))
    .where(eq(subscriptionPlans.planId, planId))
    .then((rows) => rows[0]);
}

function periodLabel(periodHours: number): string {
  if (periodHours % (24 * 30) === 0) return `${periodHours / (24 * 30)}mo`;
  if (periodHours % 24 === 0) return `${periodHours / 24}d`;
  return `${periodHours}h`;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: ACTIONS_CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;
  const plan = await findPlan(planId);

  if (!plan) {
    return NextResponse.json({ message: `no plan found for planId "${planId}"` }, {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const priceLabel = (plan.amountBaseUnits / 1_000_000).toFixed(2);
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const payload: ActionGetResponse = {
    type: "action",
    icon: plan.imageUrl,
    title: plan.title,
    description: plan.description ?? `Recurring subscription, billed every ${periodLabel(plan.periodHours)}.`,
    label: `Subscribe for $${priceLabel}/${periodLabel(plan.periodHours)}`,
    links: {
      actions: [
        {
          type: "transaction",
          label: `Subscribe for $${priceLabel}/${periodLabel(plan.periodHours)}`,
          href: `${baseUrl}/api/actions/subscribe/${planId}`,
        },
      ],
    },
  };

  return NextResponse.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;
  const plan = await findPlan(planId);

  if (!plan) {
    return NextResponse.json({ message: `no plan found for planId "${planId}"` }, {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  let body: ActionPostRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  let subscriber: PublicKey;
  try {
    subscriber = new PublicKey(body.account);
  } catch {
    return NextResponse.json({ message: "Invalid subscriber account" }, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const mint = new PublicKey(plan.mint);
  const merchant = new PublicKey(plan.merchantWallet);
  const subscriberAta = getAssociatedTokenAddressSync(mint, subscriber);
  const connection = getConnection();
  const priceLabel = (plan.amountBaseUnits / 1_000_000).toFixed(2);

  // Two-step flow for a first-time subscriber: this call only sets up their
  // SubscriptionAuthority; the caller re-POSTs the same body once it lands
  // to get the actual Subscribe transaction. Bundling both in one
  // transaction was tried first (using the program's `UNKNOWN_INIT_ID`
  // same-slot sentinel) but was rejected by the live devnet deployment with
  // `StaleSubscriptionAuthority` - see subscribeIx's doc comment. Binding to
  // a concrete, already-confirmed `init_id` is what's actually verified to
  // work, so that's what this does, at the cost of a second round trip.
  const authorityExists = await hasSubscriptionAuthority(subscriber, mint);
  if (!authorityExists) {
    const instructions: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(subscriber, subscriberAta, subscriber, mint),
      await initSubscriptionAuthorityIx({
        owner: subscriber,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        userAta: subscriberAta,
      }),
    ];
    const transaction = await buildUnsignedTransaction(connection, subscriber, instructions);
    const response: ActionPostResponse & { requiresFollowUp: true } = {
      type: "transaction",
      transaction,
      message: `Set up your subscription authority for ${plan.mint}. Once this lands, call this same endpoint again to subscribe to ${plan.title}.`,
      requiresFollowUp: true,
    };
    return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
  }

  const ix = await subscribeIx({ subscriber, merchant, planId: BigInt(plan.planId) });
  const transaction = await buildUnsignedTransaction(connection, subscriber, [ix]);
  const planAddress = await planPda(merchant, BigInt(plan.planId));
  const subscriptionPda = await subscriptionDelegationPda(planAddress, subscriber);

  const response: ActionPostResponse & { subscriptionPda: string; requiresFollowUp: false } = {
    type: "transaction",
    transaction,
    message: `Subscribe to ${plan.title} for $${priceLabel} every ${periodLabel(plan.periodHours)}.`,
    subscriptionPda: subscriptionPda.toBase58(),
    requiresFollowUp: false,
  };

  return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
}
