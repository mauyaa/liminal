import { NextRequest, NextResponse } from "next/server";
import { Transaction } from "@solana/web3.js";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsoredTransactions } from "@/lib/db/schema";
import { getConnection } from "@/lib/solana/program";
import { getRelayerKeypair, messageHash } from "@/lib/solana/relayer";

/**
 * Co-signs and broadcasts a sponsored transaction as the relayer's own fee
 * payer. Only ever signs a transaction the relayer itself already built and
 * pre-approved (matched by a hash of its compiled message, recorded when
 * `/api/actions/buy/[sku]?sponsored=true` built it) - never an arbitrary
 * transaction handed to it, and never twice.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { transaction?: string } | null;
  if (!body?.transaction) {
    return NextResponse.json({ message: "transaction is required" }, { status: 400 });
  }

  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ message: "sponsored checkout is not configured on this server" }, { status: 404 });
  }

  let transaction: Transaction;
  try {
    transaction = Transaction.from(Buffer.from(body.transaction, "base64"));
  } catch {
    return NextResponse.json({ message: "transaction is not a validly-encoded transaction" }, { status: 400 });
  }

  if (!transaction.feePayer?.equals(relayer.publicKey)) {
    return NextResponse.json({ message: "this relayer is not the fee payer on this transaction" }, { status: 400 });
  }

  const hash = messageHash(transaction);
  const updated = await db
    .update(sponsoredTransactions)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(sponsoredTransactions.messageHash, hash),
        eq(sponsoredTransactions.feePayer, relayer.publicKey.toBase58()),
        isNull(sponsoredTransactions.consumedAt),
        gt(sponsoredTransactions.expiresAt, new Date())
      )
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json(
      { message: "this transaction was not pre-approved for sponsorship, already submitted, or has expired" },
      { status: 400 }
    );
  }

  transaction.partialSign(relayer);

  try {
    const connection = getConnection();
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    return NextResponse.json({ signature });
  } catch (err) {
    // The approval was marked consumed above, but nothing was actually
    // confirmed to land - un-consume it so the caller can retry the exact
    // same pre-signed transaction rather than losing the approval to a
    // transient RPC/network failure and having to restart checkout from
    // scratch. Safe to retry: Solana dedupes identical signed transactions,
    // so if this one actually landed moments after a timed-out confirm, a
    // resubmission is a harmless no-op rather than a double-charge.
    await db
      .update(sponsoredTransactions)
      .set({ consumedAt: null })
      .where(eq(sponsoredTransactions.messageHash, hash));

    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: `failed to submit, please retry: ${message}` }, { status: 502 });
  }
}
