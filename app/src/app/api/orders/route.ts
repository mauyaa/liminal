import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants } from "@/lib/db/schema";

/**
 * Lists orders for either side of the market: `?buyerWallet=` returns a
 * buyer's purchase history (populated once `/api/orders/sync` has recorded
 * them as the funder), `?merchantWallet=` returns every order across a
 * merchant's listings. Exactly one of the two is required.
 */
export async function GET(request: NextRequest) {
  const buyerWallet = request.nextUrl.searchParams.get("buyerWallet");
  const merchantWallet = request.nextUrl.searchParams.get("merchantWallet");

  if ((!buyerWallet && !merchantWallet) || (buyerWallet && merchantWallet)) {
    return NextResponse.json(
      { message: "exactly one of buyerWallet or merchantWallet is required" },
      { status: 400 }
    );
  }

  const rows = await db
    .select({
      orderPda: orders.orderPda,
      escrowStatus: orders.escrowStatus,
      buyerWallet: orders.buyerWallet,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      sku: products.sku,
      title: products.title,
      imageUrl: products.imageUrl,
      priceUsdc: products.priceUsdc,
      mint: products.mint,
      deliveryWindowSeconds: products.deliveryWindowSeconds,
      merchantWallet: merchants.wallet,
      storeName: merchants.storeName,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(
      buyerWallet ? eq(orders.buyerWallet, buyerWallet) : eq(merchants.wallet, merchantWallet!)
    )
    .orderBy(orders.createdAt);

  return NextResponse.json({ orders: rows });
}
