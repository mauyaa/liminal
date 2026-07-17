import { NextRequest, NextResponse } from "next/server";
import { BN } from "@anchor-lang/core";
import { PublicKey, Transaction, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { db } from "@/lib/db/client";
import { orders, products, merchants, notifications } from "@/lib/db/schema";
import {
  assertSimulates,
  escrowStatusFromAccount,
  getConnection,
  getProgram,
  marketItemIdToBn,
  oracleConfigPda,
} from "@/lib/solana/program";
import { getRelayerKeypair } from "@/lib/solana/relayer";
import { buildSignalDeliveryAttestation } from "@/lib/solana/delivery-oracle";
import { syncOrder } from "@/app/api/orders/sync/route";

export const runtime = "nodejs";

/** The buyer's protection window once a seller marks delivery. Product policy, not user-configurable yet. */
const CHALLENGE_WINDOW_SECS = 48 * 3600;

interface SignalDeliveryBody {
  sellerWallet: string;
  deliveryNote?: string;
  signature: string; // base58, over `message`
}

/**
 * Marks an order delivered and opens the challenge window - the seller-side
 * "I delivered" action. `signal_delivery` is permissionless and needs no
 * on-chain signature from the seller at all (same trust model as
 * `settle_order_with_oracle`), which is exactly why this route has to do
 * its own access-control check before signing and submitting on anyone's
 * behalf: without it, any caller could hit this endpoint and force any
 * order's delivery signal. The seller proves they actually authorized this
 * specific call by signing `mark-delivered:${orderPda}` off-chain with their
 * wallet (free, no gas, no on-chain tx) - verified here with
 * `nacl.sign.detached.verify` against the wallet on record for this order's
 * merchant before anything else happens.
 *
 * Everything else is server-signed: the relayer (fee payer) and the
 * delivery-oracle key (attestation) both sign, so the seller's wallet never
 * builds or submits a transaction for this step at all.
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

  const body = (await request.json().catch(() => null)) as SignalDeliveryBody | null;
  if (!body?.sellerWallet || !body?.signature) {
    return NextResponse.json({ message: "sellerWallet and signature are required" }, { status: 400 });
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
  if (body.sellerWallet !== row.merchantWallet) {
    return NextResponse.json({ message: "sellerWallet does not match this order's seller" }, { status: 403 });
  }

  let sellerPubkey: PublicKey;
  let signatureBytes: Uint8Array;
  try {
    sellerPubkey = new PublicKey(body.sellerWallet);
    signatureBytes = bs58.decode(body.signature);
  } catch {
    return NextResponse.json({ message: "sellerWallet or signature is malformed" }, { status: 400 });
  }

  const expectedMessage = new TextEncoder().encode(`mark-delivered:${orderPda.toBase58()}`);
  const verified = nacl.sign.detached.verify(expectedMessage, signatureBytes, sellerPubkey.toBytes());
  if (!verified) {
    return NextResponse.json({ message: "signature does not match sellerWallet for this order" }, { status: 403 });
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
      { message: `order is ${status}, only a FUNDED order can be marked delivered` },
      { status: 409 }
    );
  }

  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ message: "delivery signaling is not configured on this server" }, { status: 404 });
  }

  const mint = new PublicKey(row.mint);
  const marketItemId = BigInt(row.marketItemId);
  const seller = sellerPubkey;

  const attestationIx = buildSignalDeliveryAttestation(orderPda, CHALLENGE_WINDOW_SECS);
  const signalIx = await program.methods
    .signalDelivery(marketItemIdToBn(marketItemId), new BN(CHALLENGE_WINDOW_SECS))
    .accountsPartial({
      payer: relayer.publicKey,
      seller,
      orderState: orderPda,
      oracleConfig: oracleConfigPda(program.programId, mint),
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();

  const transaction = new Transaction().add(attestationIx, signalIx);
  transaction.feePayer = relayer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  await assertSimulates(connection, transaction);
  transaction.sign(relayer);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  const deliveryNote = typeof body.deliveryNote === "string" ? body.deliveryNote.slice(0, 2000) : undefined;
  await db
    .update(orders)
    .set({ resolutionTxSignature: signature, ...(deliveryNote ? { deliveryNote } : {}) })
    .where(eq(orders.orderPda, orderPda.toBase58()));

  await syncOrder(orderPda.toBase58());

  await db.insert(notifications).values({
    orderPda: orderPda.toBase58(),
    channel: "email",
    event: "delivery_signaled",
    payload: JSON.stringify({ challengeWindowSecs: CHALLENGE_WINDOW_SECS, deliveryNote: deliveryNote ?? null }),
  });

  return NextResponse.json({ orderPda: orderPda.toBase58(), signature, challengeWindowSecs: CHALLENGE_WINDOW_SECS });
}
