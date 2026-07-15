import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, ESCROW_STATUSES, type EscrowStatus } from "@/lib/db/schema";
import { escrowStatusFromAccount, getConnection, getProgram } from "@/lib/solana/program";

/**
 * Re-reads the on-chain `OrderState` for a given order and syncs the DB row
 * to it. Called by a client after it observes a fund/settle/refund
 * transaction land, since the server never sees wallet-submitted txs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.orderPda) {
    return NextResponse.json({ message: "orderPda is required" }, { status: 400 });
  }

  let orderPda: PublicKey;
  try {
    orderPda = new PublicKey(body.orderPda);
  } catch {
    return NextResponse.json({ message: "orderPda must be a base58 pubkey" }, { status: 400 });
  }

  const orderRow = await db.query.orders.findFirst({ where: eq(orders.orderPda, body.orderPda) });
  if (!orderRow) {
    return NextResponse.json({ message: "unknown orderPda" }, { status: 404 });
  }

  const program = getProgram(getConnection());
  const onChain = await program.account.orderState.fetchNullable(orderPda);
  if (!onChain) {
    return NextResponse.json({ message: "order account not found on-chain" }, { status: 404 });
  }

  const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
  if (!ESCROW_STATUSES.includes(status as EscrowStatus)) {
    return NextResponse.json({ message: `unrecognized on-chain status: ${status}` }, { status: 500 });
  }

  const isDefaultBuyer = onChain.buyer.equals(PublicKey.default);

  await db
    .update(orders)
    .set({
      escrowStatus: status as EscrowStatus,
      buyerWallet: isDefaultBuyer ? null : onChain.buyer.toBase58(),
      updatedAt: new Date(),
    })
    .where(eq(orders.orderPda, body.orderPda));

  return NextResponse.json({ orderPda: body.orderPda, escrowStatus: status });
}
