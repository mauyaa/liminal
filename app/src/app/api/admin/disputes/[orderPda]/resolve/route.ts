import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products, merchants, disputes, notifications } from "@/lib/db/schema";
import {
  assertSimulates,
  escrowStatusFromAccount,
  getConnection,
  getProgram,
  marketItemIdToBn,
  oracleConfigPda,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";
import { getRelayerKeypair } from "@/lib/solana/relayer";
import { buildResolveDisputeAttestation } from "@/lib/solana/delivery-oracle";
import { requireAdminAuth } from "@/lib/admin-auth";
import { syncOrder } from "@/app/api/orders/sync/route";

export const runtime = "nodejs";

interface ResolveBody {
  sellerBps: number;
  reasoning: string;
}

/**
 * Issues a verdict for a disputed order: `sellerBps` of the principal to the
 * seller, the remainder to the buyer. Server-signed end to end (relayer as
 * fee payer, the delivery-oracle key as attestor) - the operator's only
 * input is this HTTP call, gated behind `ADMIN_SECRET`. No AI proposal in
 * this pass; the operator picks the split and writes the reasoning
 * themselves, which is then hashed and bound into the on-chain attestation
 * so the ruling is tamper-evident.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderPda: string }> }
) {
  const unauthorized = requireAdminAuth(request);
  if (unauthorized) return unauthorized;

  const { orderPda: orderPdaParam } = await params;
  let orderPda: PublicKey;
  try {
    orderPda = new PublicKey(orderPdaParam);
  } catch {
    return NextResponse.json({ message: "orderPda must be a base58 pubkey" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as ResolveBody | null;
  if (
    !body ||
    typeof body.sellerBps !== "number" ||
    !Number.isInteger(body.sellerBps) ||
    body.sellerBps < 0 ||
    body.sellerBps > 10_000 ||
    !body.reasoning?.trim()
  ) {
    return NextResponse.json(
      { message: "sellerBps (integer 0-10000) and a non-empty reasoning are required" },
      { status: 400 }
    );
  }

  const row = await db
    .select({ marketItemId: products.marketItemId, mint: products.mint, merchantWallet: merchants.wallet })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.orderPda, orderPda.toBase58()))
    .then((rows) => rows[0]);
  if (!row) {
    return NextResponse.json({ message: `no order found for "${orderPdaParam}"` }, { status: 404 });
  }

  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ message: "dispute resolution is not configured on this server" }, { status: 404 });
  }

  const connection = getConnection();
  const program = getProgram(connection);

  const onChain = await program.account.orderState.fetchNullable(orderPda);
  if (!onChain) {
    return NextResponse.json({ message: "order account not found on-chain" }, { status: 404 });
  }
  const status = escrowStatusFromAccount(onChain.status as Record<string, unknown>);
  if (status !== "DISPUTED") {
    return NextResponse.json({ message: `order is ${status}, only a DISPUTED order can be resolved` }, { status: 409 });
  }

  const seller = new PublicKey(row.merchantWallet);
  const buyer = onChain.buyer as PublicKey;
  const mint = new PublicKey(row.mint);
  const marketItemId = BigInt(row.marketItemId);

  const verdictHash = createHash("sha256").update(body.reasoning, "utf8").digest();
  const attestationIx = buildResolveDisputeAttestation(orderPda, body.sellerBps, verdictHash);

  const sellerAta = getAssociatedTokenAddressSync(mint, seller);
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer);

  const resolveIx = await program.methods
    .resolveDispute(marketItemIdToBn(marketItemId), body.sellerBps, Array.from(verdictHash))
    .accountsPartial({
      payer: relayer.publicKey,
      seller,
      orderState: orderPda,
      mint,
      oracleConfig: oracleConfigPda(program.programId, mint),
      unifiedVault: unifiedVaultPda(program.programId, mint),
      vaultTokenAccount: vaultTokenPda(program.programId, mint),
      sellerTokenAccount: sellerAta,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const transaction = new Transaction().add(
    attestationIx,
    createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, sellerAta, seller, mint),
    createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, buyerAta, buyer, mint),
    resolveIx
  );
  transaction.feePayer = relayer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  await assertSimulates(connection, transaction);
  transaction.sign(relayer);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  const verdictHashHex = verdictHash.toString("hex");
  await db
    .update(disputes)
    .set({
      resolvedSellerBps: body.sellerBps,
      verdictReasoning: body.reasoning,
      verdictHash: verdictHashHex,
      resolvedTxSignature: signature,
      resolvedAt: new Date(),
    })
    .where(eq(disputes.orderPda, orderPda.toBase58()));

  await syncOrder(orderPda.toBase58());

  await db.insert(notifications).values({
    orderPda: orderPda.toBase58(),
    channel: "email",
    event: "dispute_resolved",
    payload: JSON.stringify({ sellerBps: body.sellerBps, verdictHash: verdictHashHex }),
  });

  return NextResponse.json({ orderPda: orderPda.toBase58(), signature, sellerBps: body.sellerBps, verdictHash: verdictHashHex });
}
