import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants } from "@/lib/db/schema";
import {
  escrowStatusFromAccount,
  getConnection,
  getProgram,
  marketItemIdToBn,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";
import { getRelayerKeypair } from "@/lib/solana/relayer";
import { syncOrder } from "@/app/api/orders/sync/route";
import { requireCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bounded per poll so a backlog can't blow the serverless time budget. */
const MAX_REFUNDS_PER_POLL = 10;

/**
 * Autonomously refunds every expired escrow: any order still FUNDED whose
 * on-chain delivery deadline has passed gets a `refund_order` transaction
 * built, signed, and submitted by the relayer - no buyer action needed at
 * all. This is what makes the escrow's core promise ("automatically
 * refundable after the deadline") actually automatic rather than a manual
 * claim the buyer has to know to make. Safe because `refund_order` is
 * permissionless by design and always pays out to the recorded buyer; the
 * relayer only spends the transaction fee. Same cron pattern and
 * CRON_SECRET gate as /api/webhooks/poll and /api/subscriptions/poll.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ configured: false, message: "no relayer configured" });
  }

  const funded = await db
    .select({
      orderPda: orders.orderPda,
      marketItemId: products.marketItemId,
      mint: products.mint,
      merchantWallet: merchants.wallet,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.escrowStatus, "FUNDED"));

  const connection = getConnection();
  const program = getProgram(connection);
  const now = Date.now() / 1000;

  const refunded: string[] = [];
  const errors: string[] = [];
  let notYetDue = 0;

  for (const row of funded) {
    if (refunded.length >= MAX_REFUNDS_PER_POLL) break;
    try {
      const orderPda = new PublicKey(row.orderPda);
      const onChain = await program.account.orderState.fetchNullable(orderPda);
      if (!onChain) continue;

      const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
      if (status !== "FUNDED") {
        // DB is stale - let syncOrder catch it up (and fire the webhook).
        await syncOrder(row.orderPda);
        continue;
      }

      const deadline = onChain.deliveryDeadline.toNumber();
      if (deadline <= 0 || now < deadline) {
        notYetDue++;
        continue;
      }

      const buyer = onChain.buyer as PublicKey;
      const seller = new PublicKey(row.merchantWallet);
      const mint = new PublicKey(row.mint);
      const buyerAta = getAssociatedTokenAddressSync(mint, buyer);

      const refundIx = await program.methods
        .refundOrder(marketItemIdToBn(BigInt(row.marketItemId)))
        .accountsPartial({
          payer: relayer.publicKey,
          seller,
          orderState: orderPda,
          mint,
          unifiedVault: unifiedVaultPda(program.programId, mint),
          vaultTokenAccount: vaultTokenPda(program.programId, mint),
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, buyerAta, buyer, mint),
        refundIx
      );
      transaction.feePayer = relayer.publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.sign(relayer);

      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      await db
        .update(orders)
        .set({ resolutionTxSignature: signature })
        .where(eq(orders.orderPda, row.orderPda));
      await syncOrder(row.orderPda);

      refunded.push(row.orderPda);
    } catch (err) {
      errors.push(`${row.orderPda}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    configured: true,
    checked: funded.length,
    notYetDue,
    refunded,
    errors,
  });
}
