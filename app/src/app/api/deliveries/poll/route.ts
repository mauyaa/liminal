import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants, notifications } from "@/lib/db/schema";
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
const MAX_FINALIZATIONS_PER_POLL = 10;

/**
 * Autonomously finalizes every signaled delivery whose challenge window has
 * passed unchallenged: any order still DELIVERY_SIGNALED whose on-chain
 * `challenge_deadline` has elapsed gets a `finalize_delivery` transaction
 * built, signed, and submitted by the relayer - no buyer action needed. This
 * is what makes "auto-releases unless disputed" actually automatic, the
 * same role `/api/refunds/poll` plays for expired, never-delivered orders.
 * Safe because `finalize_delivery` is permissionless by design and always
 * pays out to the order's recorded seller; the relayer only spends the
 * transaction fee.
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

  const signaled = await db
    .select({
      orderPda: orders.orderPda,
      marketItemId: products.marketItemId,
      mint: products.mint,
      merchantWallet: merchants.wallet,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.escrowStatus, "DELIVERY_SIGNALED"));

  const connection = getConnection();
  const program = getProgram(connection);
  const now = Date.now() / 1000;

  const finalized: string[] = [];
  const errors: string[] = [];
  let notYetDue = 0;

  for (const row of signaled) {
    if (finalized.length >= MAX_FINALIZATIONS_PER_POLL) break;
    try {
      const orderPda = new PublicKey(row.orderPda);
      const onChain = await program.account.orderState.fetchNullable(orderPda);
      if (!onChain) continue;

      const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
      if (status !== "DELIVERY_SIGNALED") {
        // DB is stale (e.g. buyer already confirmed or challenged) - let syncOrder catch it up.
        await syncOrder(row.orderPda);
        continue;
      }

      const challengeDeadline = onChain.challengeDeadline.toNumber();
      if (challengeDeadline <= 0 || now < challengeDeadline) {
        notYetDue++;
        continue;
      }

      const seller = new PublicKey(row.merchantWallet);
      const mint = new PublicKey(row.mint);
      const sellerAta = getAssociatedTokenAddressSync(mint, seller);

      const finalizeIx = await program.methods
        .finalizeDelivery(marketItemIdToBn(BigInt(row.marketItemId)))
        .accountsPartial({
          payer: relayer.publicKey,
          seller,
          orderState: orderPda,
          mint,
          unifiedVault: unifiedVaultPda(program.programId, mint),
          vaultTokenAccount: vaultTokenPda(program.programId, mint),
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const transaction = new Transaction().add(finalizeIx);
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

      await db.insert(notifications).values({
        orderPda: row.orderPda,
        channel: "email",
        event: "finalized",
        payload: JSON.stringify({ signature }),
      });

      finalized.push(row.orderPda);
    } catch (err) {
      errors.push(`${row.orderPda}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    configured: true,
    checked: signaled.length,
    notYetDue,
    finalized,
    errors,
  });
}
