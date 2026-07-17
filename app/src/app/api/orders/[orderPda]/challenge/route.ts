import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants } from "@/lib/db/schema";
import {
  buildUnsignedTransaction,
  escrowStatusFromAccount,
  getConnection,
  getProgram,
  marketItemIdToBn,
} from "@/lib/solana/program";

export const runtime = "nodejs";

/**
 * Builds the unsigned `challenge_order` transaction for the buyer to sign:
 * "something's wrong with this delivery" - disputes it before the challenge
 * window closes. Moves no funds; parks the order in DISPUTED until a
 * resolution mechanism (not built yet) exists.
 */
export async function POST(
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
      marketItemId: products.marketItemId,
      merchantWallet: merchants.wallet,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.orderPda, orderPda.toBase58()))
    .then((rows) => rows[0]);

  if (!row) {
    return NextResponse.json({ message: `no order found for "${orderPdaParam}"` }, { status: 404 });
  }

  const connection = getConnection();
  const program = getProgram(connection);

  const onChain = await program.account.orderState.fetchNullable(orderPda);
  if (!onChain) {
    return NextResponse.json({ message: "order account not found on-chain" }, { status: 404 });
  }
  const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
  if (status !== "DELIVERY_SIGNALED") {
    return NextResponse.json(
      { message: `order is ${status}, only a DELIVERY_SIGNALED order can be challenged` },
      { status: 409 }
    );
  }
  const challengeDeadline = onChain.challengeDeadline.toNumber();
  if (Date.now() / 1000 >= challengeDeadline) {
    return NextResponse.json(
      { message: `the challenge window closed at ${new Date(challengeDeadline * 1000).toISOString()}` },
      { status: 409 }
    );
  }

  const buyer = onChain.buyer as PublicKey;
  const seller = new PublicKey(row.merchantWallet);
  const marketItemId = BigInt(row.marketItemId);

  const challengeIx = await program.methods
    .challengeOrder(marketItemIdToBn(marketItemId))
    .accountsPartial({ buyer, seller, orderState: orderPda })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, buyer, [challengeIx]);

  return NextResponse.json({ orderPda: orderPda.toBase58(), buyer: buyer.toBase58(), transaction });
}
