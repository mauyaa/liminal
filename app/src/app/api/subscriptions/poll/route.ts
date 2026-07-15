import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptionSubscribers, subscriptionPlans, merchants } from "@/lib/db/schema";
import { getConnection } from "@/lib/solana/program";
import { getRelayerKeypair } from "@/lib/solana/relayer";
import { collectSubscriptionIx, isSubscriptionDueForCollect } from "@/lib/solana/subscriptions";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Autonomously collects due subscription payments - the "merchant's
 * automated off-chain cron bot" half of recurring billing, which
 * `/api/merchant/plans/[planId]/collect` (a manually-triggered endpoint)
 * doesn't provide on its own. Fully signed and submitted server-side by the
 * relayer keypair (registered as a puller on the plan at creation time) -
 * no merchant or subscriber interaction needed. Meant to be hit on a
 * schedule, same as `/api/webhooks/poll` - see README's "Subscriptions"
 * section.
 */
export async function GET() {
  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ message: "automated billing is not configured on this server" }, { status: 404 });
  }

  const rows = await db
    .select({
      subscriptionPda: subscriptionSubscribers.subscriptionPda,
      subscriberWallet: subscriptionSubscribers.subscriberWallet,
      planId: subscriptionPlans.planId,
      mint: subscriptionPlans.mint,
      merchantWallet: merchants.wallet,
    })
    .from(subscriptionSubscribers)
    .innerJoin(subscriptionPlans, eq(subscriptionSubscribers.planId, subscriptionPlans.id))
    .innerJoin(merchants, eq(subscriptionPlans.merchantId, merchants.id));

  const connection = getConnection();
  let collected = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const subscriptionPda = new PublicKey(row.subscriptionPda);
      const due = await isSubscriptionDueForCollect(subscriptionPda);
      if (!due) {
        skipped++;
        continue;
      }

      const mint = new PublicKey(row.mint);
      const merchantWallet = new PublicKey(row.merchantWallet);
      const merchantAta = getAssociatedTokenAddressSync(mint, merchantWallet);

      const collectIx = await collectSubscriptionIx({
        caller: relayer.publicKey,
        subscriber: new PublicKey(row.subscriberWallet),
        merchant: merchantWallet,
        planId: BigInt(row.planId),
        receiverAta: merchantAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, merchantAta, merchantWallet, mint),
        collectIx
      );
      tx.feePayer = relayer.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(relayer);

      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      collected++;
    } catch (err) {
      errors.push(`${row.subscriptionPda}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ checked: rows.length, collected, skipped, errors });
}
