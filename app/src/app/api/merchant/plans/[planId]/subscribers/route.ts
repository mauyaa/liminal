import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptionPlans, subscriptionSubscribers } from "@/lib/db/schema";

/** Lists the cached subscribers for a plan, for a merchant's collect UI. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;

  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.planId, planId),
  });
  if (!plan) {
    return NextResponse.json({ message: `no plan found for planId "${planId}"` }, { status: 404 });
  }

  const rows = await db.query.subscriptionSubscribers.findMany({
    where: eq(subscriptionSubscribers.planId, plan.id),
    orderBy: (subscriptionSubscribers, { desc }) => [desc(subscriptionSubscribers.createdAt)],
  });

  const subscribers = rows.map((row) => ({
    subscriberWallet: row.subscriberWallet,
    subscriptionPda: row.subscriptionPda,
  }));

  return NextResponse.json({ subscribers });
}
