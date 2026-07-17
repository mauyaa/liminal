import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { disputes, orders, products, merchants, evidence } from "@/lib/db/schema";
import { requireAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** Lists open disputes with their order context and evidence, for the /admin/disputes page. */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminAuth(request);
  if (unauthorized) return unauthorized;

  const openDisputes = await db
    .select({
      orderPda: disputes.orderPda,
      openedAt: disputes.openedAt,
      title: products.title,
      priceUsdc: products.priceUsdc,
      buyerWallet: orders.buyerWallet,
      sellerWallet: merchants.wallet,
    })
    .from(disputes)
    .innerJoin(orders, eq(disputes.orderPda, orders.orderPda))
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(isNull(disputes.resolvedAt))
    .orderBy(desc(disputes.openedAt));

  const withEvidence = await Promise.all(
    openDisputes.map(async (d) => {
      const items = await db
        .select({ submittedBy: evidence.submittedBy, content: evidence.content, createdAt: evidence.createdAt })
        .from(evidence)
        .where(eq(evidence.orderPda, d.orderPda))
        .orderBy(evidence.createdAt);
      return { ...d, evidence: items };
    })
  );

  return NextResponse.json({ disputes: withEvidence });
}
