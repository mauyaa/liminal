import { NextRequest, NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS } from "@solana/actions";
import type { ActionGetResponse, ActionPostRequest, ActionPostResponse } from "@solana/actions";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, merchants, sponsoredTransactions } from "@/lib/db/schema";
import {
  assertSimulates,
  buildUnsignedTransaction,
  getConnection,
  getProgram,
  marketItemIdToBn,
  orderStatePda,
  SimulationError,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";
import { getRelayerKeypair, messageHash, RELAYER_FEE_BASE_UNITS, SPONSORSHIP_TTL_MS } from "@/lib/solana/relayer";
import { isRateLimited, rateLimitedResponse, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function findListing(sku: string) {
  return db
    .select({
      sku: products.sku,
      title: products.title,
      description: products.description,
      imageUrl: products.imageUrl,
      priceUsdc: products.priceUsdc,
      mint: products.mint,
      marketItemId: products.marketItemId,
      deliveryWindowSeconds: products.deliveryWindowSeconds,
      sellerWallet: merchants.wallet,
    })
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(products.sku, sku))
    .then((rows) => rows[0]);
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: ACTIONS_CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const listing = await findListing(sku);

  if (!listing) {
    return NextResponse.json({ message: `No listing found for sku "${sku}"` } satisfies { message: string }, {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const priceLabel = (listing.priceUsdc / 1_000_000).toFixed(2);
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // deliveryWindowSeconds rides along as an extra field (harmless to
  // spec-compliant Actions clients) so the checkout page can state the
  // delivery promise before the deadline exists on-chain.
  const payload: ActionGetResponse & { deliveryWindowSeconds: number } = {
    type: "action",
    icon: listing.imageUrl,
    title: listing.title,
    description: listing.description ?? `Zero-fee escrowed checkout for ${listing.title}.`,
    label: `Buy for $${priceLabel}`,
    deliveryWindowSeconds: listing.deliveryWindowSeconds,
    links: {
      actions: [
        {
          type: "transaction",
          label: `Buy for $${priceLabel}`,
          href: `${baseUrl}/api/actions/buy/${sku}`,
        },
        {
          type: "transaction",
          label: `Buy for $${priceLabel} (no SOL needed)`,
          href: `${baseUrl}/api/actions/buy/${sku}?sponsored=true`,
        },
      ],
    },
  };

  return NextResponse.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const listing = await findListing(sku);

  if (!listing) {
    return NextResponse.json({ message: `No listing found for sku "${sku}"` }, {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  let body: ActionPostRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  let buyer: PublicKey;
  try {
    buyer = new PublicKey(body.account);
  } catch {
    return NextResponse.json({ message: "Invalid buyer account" }, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
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

  const sponsored = request.nextUrl.searchParams.get("sponsored") === "true";

  if (!sponsored) {
    let transaction: string;
    try {
      transaction = await buildUnsignedTransaction(connection, buyer, [
        createAssociatedTokenAccountIdempotentInstruction(buyer, buyerAta, buyer, mint),
        fundIx,
      ]);
    } catch (err) {
      if (err instanceof SimulationError) {
        return NextResponse.json({ message: err.message }, { status: 502, headers: ACTIONS_CORS_HEADERS });
      }
      throw err;
    }

    const response: ActionPostResponse & { orderPda: string } = {
      type: "transaction",
      transaction,
      message: `Escrow ${listing.title} for $${(listing.priceUsdc / 1_000_000).toFixed(2)} until delivery is confirmed.`,
      orderPda: orderState.toBase58(),
    };

    return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
  }

  // Sponsored: the relayer pays the SOL fee (and any ATA rent, since the
  // whole point is the buyer needs zero SOL), reimbursed in the mint's
  // smallest unit via a flat fee. See relayer.ts and README's "Gasless
  // checkout" section.
  // Rate-limited per IP and per buyer wallet: each approval here commits
  // the relayer to spending SOL if submitted, so this - not the free
  // non-sponsored branch above - is the abuse surface worth gating.
  if (
    (await isRateLimited("sponsor-ip", requestIp(request), 6, 60)) ||
    (await isRateLimited("sponsor-wallet", buyer.toBase58(), 6, 60))
  ) {
    return rateLimitedResponse(ACTIONS_CORS_HEADERS);
  }

  let relayer;
  try {
    relayer = getRelayerKeypair();
  } catch {
    return NextResponse.json({ message: "sponsored checkout is not configured on this server" }, {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const relayerAta = getAssociatedTokenAddressSync(mint, relayer.publicKey);
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, relayerAta, relayer.publicKey, mint),
    createAssociatedTokenAccountIdempotentInstruction(relayer.publicKey, buyerAta, buyer, mint),
    fundIx,
    createTransferInstruction(buyerAta, relayerAta, buyer, RELAYER_FEE_BASE_UNITS),
  ];

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = relayer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  try {
    await assertSimulates(connection, transaction);
  } catch (err) {
    if (err instanceof SimulationError) {
      return NextResponse.json({ message: err.message }, { status: 502, headers: ACTIONS_CORS_HEADERS });
    }
    throw err;
  }

  const hash = messageHash(transaction);
  // onConflictDoNothing: two rapid identical requests (same instructions,
  // same feePayer, same blockhash - e.g. a double-submitted click) hash to
  // the same message. That's fine to treat as "already approved" rather
  // than a hard failure, since the transaction content is identical either
  // way; a plain insert would otherwise throw on the unique constraint.
  await db
    .insert(sponsoredTransactions)
    .values({
      messageHash: hash,
      feePayer: relayer.publicKey.toBase58(),
      expiresAt: new Date(Date.now() + SPONSORSHIP_TTL_MS),
    })
    .onConflictDoNothing();

  const response: ActionPostResponse & { orderPda: string; relaySubmitUrl: string } = {
    type: "transaction",
    transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: `Escrow ${listing.title} for $${(listing.priceUsdc / 1_000_000).toFixed(2)} until delivery is confirmed. No SOL required - a relayer covers the network fee for a flat $${(RELAYER_FEE_BASE_UNITS / 1_000_000).toFixed(2)}.`,
    orderPda: orderState.toBase58(),
    relaySubmitUrl: `${request.nextUrl.protocol}//${request.nextUrl.host}/api/relay/submit`,
  };

  return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
}
