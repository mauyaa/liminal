import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants } from "@/lib/db/schema";
import { escrowStatusFromAccount, getConnection, getProgram } from "@/lib/solana/program";

export const runtime = "nodejs";

/**
 * Full detail for one order: the cached DB row merged with live on-chain
 * state (which is the source of truth for status, buyer, and the delivery
 * deadline - the DB may lag until the next sync/poll).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderPda: string }> }
) {
  const { orderPda: orderPdaParam } = await params;

  let orderPda: PublicKey;
  try {
    orderPda = new PublicKey(orderPdaParam);
  } catch {
    return NextResponse.json({ message: "orderPda must be a base58 pubkey" }, { status: 400 });
  }

  const row = await db
    .select({
      orderPda: orders.orderPda,
      escrowStatus: orders.escrowStatus,
      buyerWallet: orders.buyerWallet,
      fundTxSignature: orders.fundTxSignature,
      resolutionTxSignature: orders.resolutionTxSignature,
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
    .where(eq(orders.orderPda, orderPda.toBase58()))
    .then((rows) => rows[0]);

  if (!row) {
    return NextResponse.json({ message: `no order found for "${orderPdaParam}"` }, { status: 404 });
  }

  const program = getProgram(getConnection());
  const onChain = await program.account.orderState.fetchNullable(orderPda);

  return NextResponse.json({
    ...row,
    onChain: onChain
      ? {
          status: escrowStatusFromAccount(onChain.status as Record<string, unknown>),
          buyer: onChain.buyer.equals(PublicKey.default) ? null : onChain.buyer.toBase58(),
          principalBaseUnits: onChain.principalAmount.toString(),
          startTimestamp: onChain.startTimestamp.toNumber(),
          deliveryDeadline: onChain.deliveryDeadline.toNumber(),
          refundableNow:
            escrowStatusFromAccount(onChain.status as Record<string, unknown>) === "FUNDED" &&
            onChain.deliveryDeadline.toNumber() > 0 &&
            Date.now() / 1000 >= onChain.deliveryDeadline.toNumber(),
        }
      : null,
  });
}
