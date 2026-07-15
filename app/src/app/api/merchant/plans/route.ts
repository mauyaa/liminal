import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchants, subscriptionPlans } from "@/lib/db/schema";
import { buildUnsignedTransaction, getConnection } from "@/lib/solana/program";
import { createPlanIx, planPda } from "@/lib/solana/subscriptions";

interface CreatePlanBody {
  merchantWallet: string;
  storeName: string;
  title: string;
  description?: string;
  imageUrl: string;
  amountBaseUnits: number;
  periodHours: number;
  mint: string;
}

/**
 * Creates (or reuses) a merchant row, then returns an unsigned `CreatePlan`
 * transaction targeting the real Solana Foundation Subscriptions program for
 * the merchant's wallet to sign. The on-chain `plan_id` seed is the plan
 * row's own id, globally unique and therefore also unique per-owner.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreatePlanBody | null;
  if (
    !body?.merchantWallet ||
    !body?.storeName ||
    !body?.title ||
    !body?.imageUrl ||
    !body?.amountBaseUnits ||
    !body?.periodHours ||
    !body?.mint
  ) {
    return NextResponse.json({ message: "missing required fields" }, { status: 400 });
  }

  let owner: PublicKey;
  let mint: PublicKey;
  try {
    owner = new PublicKey(body.merchantWallet);
    mint = new PublicKey(body.mint);
  } catch {
    return NextResponse.json({ message: "merchantWallet and mint must be base58 pubkeys" }, { status: 400 });
  }

  if (body.amountBaseUnits <= 0 || body.periodHours <= 0) {
    return NextResponse.json(
      { message: "amountBaseUnits and periodHours must be greater than zero" },
      { status: 400 }
    );
  }

  let merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, body.merchantWallet),
  });
  if (!merchant) {
    const inserted = await db
      .insert(merchants)
      .values({ wallet: body.merchantWallet, storeName: body.storeName })
      .returning();
    merchant = inserted[0];
  }

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({
      merchantId: merchant.id,
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl,
      amountBaseUnits: body.amountBaseUnits,
      periodHours: body.periodHours,
      mint: body.mint,
      planId: "0", // placeholder, replaced below with the row id
      planPda: "", // placeholder, replaced below once derived
    })
    .returning();

  const planId = BigInt(plan.id);
  const planAddress = await planPda(owner, planId);

  const ix = await createPlanIx({
    owner,
    planId,
    mint,
    amount: BigInt(body.amountBaseUnits),
    periodHours: BigInt(body.periodHours),
    destinations: [owner],
    pullers: [owner],
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const connection = getConnection();
  const transaction = await buildUnsignedTransaction(connection, owner, [ix]);

  await db
    .update(subscriptionPlans)
    .set({ planId: planId.toString(), planPda: planAddress.toBase58() })
    .where(eq(subscriptionPlans.id, plan.id));

  return NextResponse.json({
    planId: planId.toString(),
    planPda: planAddress.toBase58(),
    transaction,
  });
}

/** Lists a merchant's subscription plans. */
export async function GET(request: NextRequest) {
  const merchantWallet = request.nextUrl.searchParams.get("merchantWallet");
  if (!merchantWallet) {
    return NextResponse.json({ message: "merchantWallet query param is required" }, { status: 400 });
  }

  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, merchantWallet),
  });
  if (!merchant) {
    return NextResponse.json({ plans: [] });
  }

  const rows = await db.query.subscriptionPlans.findMany({
    where: eq(subscriptionPlans.merchantId, merchant.id),
    orderBy: (subscriptionPlans, { desc }) => [desc(subscriptionPlans.createdAt)],
  });

  const plans = rows.map((plan) => ({
    planId: plan.planId,
    planPda: plan.planPda,
    title: plan.title,
    description: plan.description,
    imageUrl: plan.imageUrl,
    amountBaseUnits: plan.amountBaseUnits,
    periodHours: plan.periodHours,
    mint: plan.mint,
  }));

  return NextResponse.json({ plans });
}
