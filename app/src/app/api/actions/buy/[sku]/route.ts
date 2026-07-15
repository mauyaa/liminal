import { NextRequest, NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS } from "@solana/actions";
import type { ActionGetResponse, ActionPostRequest, ActionPostResponse } from "@solana/actions";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, merchants } from "@/lib/db/schema";
import {
  buildUnsignedTransaction,
  getConnection,
  getProgram,
  marketItemIdToBn,
  orderStatePda,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";

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

  const payload: ActionGetResponse = {
    type: "action",
    icon: listing.imageUrl,
    title: listing.title,
    description: listing.description ?? `Zero-fee escrowed checkout for ${listing.title}.`,
    label: `Buy for $${priceLabel}`,
    links: {
      actions: [
        {
          type: "transaction",
          label: `Buy for $${priceLabel}`,
          href: `${baseUrl}/api/actions/buy/${sku}`,
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

  const transaction = await buildUnsignedTransaction(connection, buyer, [
    createAssociatedTokenAccountIdempotentInstruction(buyer, buyerAta, buyer, mint),
    fundIx,
  ]);

  const response: ActionPostResponse & { orderPda: string } = {
    type: "transaction",
    transaction,
    message: `Escrow ${listing.title} for $${(listing.priceUsdc / 1_000_000).toFixed(2)} until delivery is confirmed.`,
    orderPda: orderState.toBase58(),
  };

  return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
}
