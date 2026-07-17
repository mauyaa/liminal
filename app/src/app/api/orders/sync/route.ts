import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants, disputes, ESCROW_STATUSES, type EscrowStatus } from "@/lib/db/schema";
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

  // Optionally record which transactions caused the change - the client is
  // the only party that knows the signature of a wallet-submitted tx, and
  // the order page uses these for explorer links. Display metadata only:
  // status itself always comes from re-reading the chain, never from the
  // client's claim.
  const sigs: { fundTxSignature?: string; resolutionTxSignature?: string } = {};
  if (typeof body.fundTxSignature === "string" && body.fundTxSignature.length <= 128) {
    sigs.fundTxSignature = body.fundTxSignature;
  }
  if (typeof body.resolutionTxSignature === "string" && body.resolutionTxSignature.length <= 128) {
    sigs.resolutionTxSignature = body.resolutionTxSignature;
  }
  if (Object.keys(sigs).length > 0) {
    await db.update(orders).set(sigs).where(eq(orders.orderPda, orderPda));
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
  const challengeDeadlineSecs = onChain.challengeDeadline?.toNumber?.() ?? 0;

  await db
    .update(orders)
    .set({
      escrowStatus,
      buyerWallet: isDefaultBuyer ? null : onChain.buyer.toBase58(),
      challengeDeadline: challengeDeadlineSecs > 0 ? new Date(challengeDeadlineSecs * 1000) : null,
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

  // A dispute is opened by the buyer's own wallet-signed `challenge_order`
  // tx, not a server-signed action - so unlike signal_delivery (which
  // writes its own row at the point of action) this is the one place that
  // reliably observes the transition into DISPUTED, whether it came from a
  // client-triggered sync or the autonomous poll.
  if (changed && escrowStatus === "DISPUTED") {
    await db.insert(disputes).values({ orderPda }).onConflictDoNothing();
  }

  return { escrowStatus, changed };
}
