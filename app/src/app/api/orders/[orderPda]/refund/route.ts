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

interface RefundBody {
  payerWallet: string;
}

/**
 * Builds the unsigned `refund_order` transaction. Refunds are
 * permissionless on-chain once the delivery deadline passes - any wallet
 * may be the payer (buyer, merchant, or a third party); funds always go
 * back to the recorded buyer regardless of who triggers it. The pre-checks
 * here only exist to return a useful error instead of a raw program error.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderPda: string }> }
) {
  const { orderPda: orderPdaParam } = await params;

  let orderPda: PublicKey;
  try {
    orderPda = new PublicKey(orderPdaParam);
  } catch {
    return NextResponse.json({ message: "orderPda must be a base58 pubkey" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as RefundBody | null;
  if (!body?.payerWallet) {
    return NextResponse.json({ message: "payerWallet is required" }, { status: 400 });
  }
  let payer: PublicKey;
  try {
    payer = new PublicKey(body.payerWallet);
  } catch {
    return NextResponse.json({ message: "payerWallet must be a base58 pubkey" }, { status: 400 });
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
  if (status !== "FUNDED") {
    return NextResponse.json(
      { message: `order is ${status}, only a FUNDED order can be refunded` },
      { status: 409 }
    );
  }
  const deadline = onChain.deliveryDeadline.toNumber();
  if (Date.now() / 1000 < deadline) {
    return NextResponse.json(
      {
        message: `delivery deadline not reached - refundable after ${new Date(deadline * 1000).toISOString()}`,
        deliveryDeadline: deadline,
      },
      { status: 409 }
    );
  }

  const buyer = onChain.buyer as PublicKey;
  const seller = new PublicKey(row.merchantWallet);
  const mint = new PublicKey(row.mint);
  const marketItemId = BigInt(row.marketItemId);

  const buyerAta = getAssociatedTokenAddressSync(mint, buyer);

  const refundIx = await program.methods
    .refundOrder(marketItemIdToBn(marketItemId))
    .accountsPartial({
      payer,
      seller,
      orderState: orderPda,
      mint,
      unifiedVault: unifiedVaultPda(program.programId, mint),
      vaultTokenAccount: vaultTokenPda(program.programId, mint),
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, payer, [
    createAssociatedTokenAccountIdempotentInstruction(payer, buyerAta, buyer, mint),
    refundIx,
  ]);

  return NextResponse.json({ orderPda: orderPda.toBase58(), buyer: buyer.toBase58(), transaction });
}
