import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants, ESCROW_STATUSES, type EscrowStatus } from "@/lib/db/schema";
import { escrowStatusFromAccount, getConnection, getProgram } from "@/lib/solana/program";
import { deliverOrderWebhook } from "@/lib/webhooks";

/**
 * Re-reads the on-chain `OrderState` for a given order and syncs the DB row
 * to it. Called by a client after it observes a fund/settle/refund
 * transaction land, since the server never sees wallet-submitted txs. Also
 * used by `/api/webhooks/poll` for autonomous polling, and fires the
 * merchant's webhook (if configured) whenever the synced status actually
 * changed - see `syncOrder` below.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.orderPda) {
    return NextResponse.json({ message: "orderPda is required" }, { status: 400 });
  }

  let orderPda: string;
  try {
    orderPda = new PublicKey(body.orderPda).toBase58();
  } catch {
    return NextResponse.json({ message: "orderPda must be a base58 pubkey" }, { status: 400 });
  }

  const result = await syncOrder(orderPda);
  if (!result) {
    return NextResponse.json({ message: "unknown orderPda, or order account not found on-chain" }, { status: 404 });
  }

  return NextResponse.json({ orderPda, escrowStatus: result.escrowStatus });
}

/**
 * Re-reads one order's on-chain state, updates the DB row, and fires the
 * merchant's webhook if the status actually changed. Returns `null` if the
 * order is unknown locally or missing on-chain (both callers already
 * validate this shouldn't happen in normal operation).
 */
export async function syncOrder(orderPda: string): Promise<{ escrowStatus: EscrowStatus; changed: boolean } | null> {
  const orderRow = await db
    .select({
      id: orders.id,
      escrowStatus: orders.escrowStatus,
      sku: products.sku,
      priceUsdc: products.priceUsdc,
      mint: products.mint,
      webhookUrl: merchants.webhookUrl,
      webhookSecret: merchants.webhookSecret,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.orderPda, orderPda))
    .then((rows) => rows[0]);
  if (!orderRow) return null;

  const program = getProgram(getConnection());
  const onChain = await program.account.orderState.fetchNullable(new PublicKey(orderPda));
  if (!onChain) return null;

  const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
  if (!ESCROW_STATUSES.includes(status as EscrowStatus)) {
    throw new Error(`unrecognized on-chain status for order ${orderPda}: ${status}`);
  }
  const escrowStatus = status as EscrowStatus;
  const isDefaultBuyer = onChain.buyer.equals(PublicKey.default);
  const changed = escrowStatus !== orderRow.escrowStatus;

  await db
    .update(orders)
    .set({
      escrowStatus,
      buyerWallet: isDefaultBuyer ? null : onChain.buyer.toBase58(),
      updatedAt: new Date(),
    })
    .where(eq(orders.orderPda, orderPda));

  if (changed && orderRow.webhookUrl && orderRow.webhookSecret) {
    await deliverOrderWebhook(orderRow.webhookUrl, orderRow.webhookSecret, {
      orderPda,
      sku: orderRow.sku,
      escrowStatus,
      buyerWallet: isDefaultBuyer ? null : onChain.buyer.toBase58(),
      priceUsdc: orderRow.priceUsdc,
      mint: orderRow.mint,
    });
  }

  return { escrowStatus, changed };
}
