import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { phantomSessions, products, merchants } from "@/lib/db/schema";
import { getConnection, getProgram, marketItemIdToBn, orderStatePda, unifiedVaultPda, vaultTokenPda } from "@/lib/solana/program";
import { decodeKey, decryptPayload, encryptPayload, buildSignAndSendUrl } from "@/lib/solana/phantom-deeplink";

interface ConnectData {
  public_key: string;
  session: string;
}

/**
 * Phantom redirects here after the user approves (or rejects) the Connect
 * step. On success, decrypts the session, builds the actual transaction for
 * whatever this session's `intent` was, and immediately redirects again to
 * Phantom's signAndSendTransaction - the user sees Connect then Sign as two
 * back-to-back prompts, same as it would in a native mobile app.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("token");
  if (!token) {
    return NextResponse.json({ message: "token is required" }, { status: 400 });
  }

  const session = await db.query.phantomSessions.findFirst({ where: eq(phantomSessions.token, token) });
  if (!session) {
    return NextResponse.json({ message: "unknown or expired session" }, { status: 404 });
  }

  const errorCode = params.get("errorCode");
  if (errorCode) {
    const errorMessage = params.get("errorMessage") ?? "connection rejected";
    await db.update(phantomSessions).set({ status: "failed", errorMessage }).where(eq(phantomSessions.id, session.id));
    return new NextResponse(`<p>Connection cancelled: ${errorMessage}</p>`, { headers: { "Content-Type": "text/html" } });
  }

  const phantomEncryptionPublicKey = params.get("phantom_encryption_public_key");
  const nonce = params.get("nonce");
  const data = params.get("data");
  if (!phantomEncryptionPublicKey || !nonce || !data) {
    return NextResponse.json({ message: "missing phantom_encryption_public_key, nonce, or data" }, { status: 400 });
  }

  const dappSecretKey = decodeKey(session.dappSecretKey);
  const { public_key: userPublicKey, session: phantomSession } = decryptPayload<ConnectData>(
    data,
    nonce,
    phantomEncryptionPublicKey,
    dappSecretKey
  );

  await db
    .update(phantomSessions)
    .set({ phantomEncryptionPublicKey, phantomSession, userPublicKey, status: "connected" })
    .where(eq(phantomSessions.id, session.id));

  const intent = JSON.parse(session.intent) as { type: "buy"; sku: string };
  const buyer = new PublicKey(userPublicKey);
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  if (intent.type !== "buy") {
    return NextResponse.json({ message: `unsupported intent type: ${intent.type}` }, { status: 400 });
  }

  const listing = await db
    .select({
      sellerWallet: merchants.wallet,
      mint: products.mint,
      marketItemId: products.marketItemId,
      priceUsdc: products.priceUsdc,
    })
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(products.sku, intent.sku))
    .then((rows) => rows[0]);
  if (!listing) {
    return NextResponse.json({ message: `no listing found for sku "${intent.sku}"` }, { status: 404 });
  }

  const connection = getConnection();
  const program = getProgram(connection);
  const programId = program.programId;
  const seller = new PublicKey(listing.sellerWallet);
  const mint = new PublicKey(listing.mint);
  const marketItemId = BigInt(listing.marketItemId);

  const orderState = orderStatePda(programId, seller, marketItemId);
  const unifiedVault = unifiedVaultPda(programId, mint);
  const vaultToken = vaultTokenPda(programId, mint);
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer);

  const fundIx = await program.methods
    .fundOrder(marketItemIdToBn(marketItemId))
    .accountsPartial({
      buyer,
      seller,
      orderState,
      mint,
      unifiedVault,
      vaultTokenAccount: vaultToken,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(buyer, buyerAta, buyer, mint),
    fundIx
  );
  tx.feePayer = buyer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Phantom's payload wants the serialized transaction base58-encoded (not
  // the base64 the rest of this app's Actions endpoints return).
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const { nonce: outNonce, payload } = encryptPayload(
    { transaction: bs58.encode(serialized), session: phantomSession },
    phantomEncryptionPublicKey,
    dappSecretKey
  );

  const signUrl = buildSignAndSendUrl({
    dappEncryptionPublicKey: session.dappPublicKey,
    nonce: outNonce,
    redirectLink: `${baseUrl}/api/mobile/sign-callback?token=${token}`,
    payload,
  });

  return NextResponse.redirect(signUrl);
}
