import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants } from "@/lib/db/schema";
import {
  buildUnsignedTransaction,
  escrowStatusFromAccount,
  getConnection,
  getProgram,
  marketItemIdToBn,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";

export const runtime = "nodejs";

/**
 * Builds the unsigned `confirm_delivery` transaction for the buyer to sign:
 * releases funds early once delivery has been signaled, instead of waiting
 * out the full challenge window. Same shape as `/settle`, gated on
 * DELIVERY_SIGNALED instead of FUNDED.
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
      mint: products.mint,
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
      { message: `order is ${status}, only a DELIVERY_SIGNALED order can be confirmed` },
      { status: 409 }
    );
  }

  const buyer = onChain.buyer as PublicKey;
  const seller = new PublicKey(row.merchantWallet);
  const mint = new PublicKey(row.mint);
  const marketItemId = BigInt(row.marketItemId);

  const sellerAta = getAssociatedTokenAddressSync(mint, seller);

  const confirmIx = await program.methods
    .confirmDelivery(marketItemIdToBn(marketItemId))
    .accountsPartial({
      buyer,
      seller,
      orderState: orderPda,
      mint,
      unifiedVault: unifiedVaultPda(program.programId, mint),
      vaultTokenAccount: vaultTokenPda(program.programId, mint),
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, buyer, [
    createAssociatedTokenAccountIdempotentInstruction(buyer, sellerAta, seller, mint),
    confirmIx,
  ]);

  return NextResponse.json({ orderPda: orderPda.toBase58(), buyer: buyer.toBase58(), transaction });
}
