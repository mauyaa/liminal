import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchants, products, orders } from "@/lib/db/schema";
import {
  buildUnsignedTransaction,
  getConnection,
  getProgram,
  marketItemIdToBn,
  orderStatePda,
} from "@/lib/solana/program";

interface CreateListingBody {
  merchantWallet: string;
  storeName?: string;
  sku?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  priceUsdc: number;
  mint?: string;
  deliveryWindowSeconds: number;
}

// Devnet demo USDC mint - same fallback ListingsPanel.tsx's full form defaults
// its mint field to. A caller (like /new) that doesn't ask a seller to think
// about mints yet can omit this entirely.
const DEFAULT_MINT = "AUMiaz7S6rxn2E36tSpFyNcQwfZ5FroeesU4XMHngpNZ";
const PLACEHOLDER_IMAGE = "/liminal-mark.jpg";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function truncateWallet(wallet: string): string {
  return wallet.length > 8 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

/** Finds a free sku for an auto-generated link, retrying with a new random suffix on collision. */
async function generateFreeSku(title: string): Promise<string> {
  const base = slugify(title) || "link";
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base}-${suffix}`;
    const existing = await db.query.products.findFirst({ where: eq(products.sku, candidate) });
    if (!existing) return candidate;
  }
  throw new Error("could not generate a unique link code, try again");
}

/**
 * Creates (or reuses) a merchant + product row, then returns an unsigned
 * `initialize_listing` transaction for the merchant's wallet to sign. The
 * on-chain `market_item_id` seed is the product's own row id, which is
 * globally unique and therefore also unique per-seller.
 *
 * storeName/sku/imageUrl/mint are optional - a minimal caller (the /new
 * quick-link flow) can send just merchantWallet/title/priceUsdc/
 * deliveryWindowSeconds and get sensible defaults; the full dashboard form
 * still sends every field explicitly.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreateListingBody | null;
  if (!body?.merchantWallet || !body?.title || !body?.priceUsdc || !body?.deliveryWindowSeconds) {
    return NextResponse.json({ message: "missing required fields" }, { status: 400 });
  }

  const mintInput = body.mint || DEFAULT_MINT;
  let seller: PublicKey;
  let mint: PublicKey;
  try {
    seller = new PublicKey(body.merchantWallet);
    mint = new PublicKey(mintInput);
  } catch {
    return NextResponse.json({ message: "merchantWallet and mint must be base58 pubkeys" }, { status: 400 });
  }

  if (body.priceUsdc <= 0 || body.deliveryWindowSeconds <= 0) {
    return NextResponse.json(
      { message: "priceUsdc and deliveryWindowSeconds must be greater than zero" },
      { status: 400 }
    );
  }

  let sku = body.sku;
  if (sku) {
    const existing = await db.query.products.findFirst({ where: eq(products.sku, sku) });
    if (existing) {
      return NextResponse.json({ message: `sku "${sku}" already exists` }, { status: 409 });
    }
  } else {
    try {
      sku = await generateFreeSku(body.title);
    } catch (err) {
      return NextResponse.json({ message: err instanceof Error ? err.message : "failed to generate link code" }, { status: 500 });
    }
  }

  let merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, body.merchantWallet),
  });
  if (!merchant) {
    const inserted = await db
      .insert(merchants)
      .values({ wallet: body.merchantWallet, storeName: body.storeName || truncateWallet(body.merchantWallet) })
      .returning();
    merchant = inserted[0];
  }

  const [product] = await db
    .insert(products)
    .values({
      merchantId: merchant.id,
      sku,
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl || PLACEHOLDER_IMAGE,
      priceUsdc: body.priceUsdc,
      mint: mintInput,
      marketItemId: "0", // placeholder, replaced below with the row id
      deliveryWindowSeconds: body.deliveryWindowSeconds,
    })
    .returning();

  const marketItemId = BigInt(product.id);
  await db
    .update(products)
    .set({ marketItemId: marketItemId.toString() })
    .where(eq(products.id, product.id));

  const connection = getConnection();
  const program = getProgram(connection);
  const programId = program.programId;

  const orderState = orderStatePda(programId, seller, marketItemId);

  const ix = await program.methods
    .initializeListing(
      marketItemIdToBn(marketItemId),
      marketItemIdToBn(BigInt(body.priceUsdc)),
      marketItemIdToBn(BigInt(body.deliveryWindowSeconds))
    )
    .accountsPartial({
      seller,
      mint,
      orderState,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, seller, [ix]);

  await db.insert(orders).values({
    orderPda: orderState.toBase58(),
    productId: product.id,
    escrowStatus: "INITIALIZED",
  });

  return NextResponse.json({
    sku,
    marketItemId: marketItemId.toString(),
    orderPda: orderState.toBase58(),
    transaction,
  });
}

/** Lists a merchant's products with their current order status. */
export async function GET(request: NextRequest) {
  const merchantWallet = request.nextUrl.searchParams.get("merchantWallet");
  if (!merchantWallet) {
    return NextResponse.json({ message: "merchantWallet query param is required" }, { status: 400 });
  }

  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, merchantWallet),
  });
  if (!merchant) {
    return NextResponse.json({ listings: [] });
  }

  const rows = await db.query.products.findMany({
    where: eq(products.merchantId, merchant.id),
    with: { orders: true },
    orderBy: (products, { desc }) => [desc(products.createdAt)],
  });

  const listings = rows.map((product) => {
    const order = product.orders[0];
    return {
      sku: product.sku,
      title: product.title,
      imageUrl: product.imageUrl,
      priceUsdc: product.priceUsdc,
      mint: product.mint,
      deliveryWindowSeconds: product.deliveryWindowSeconds,
      orderPda: order?.orderPda ?? null,
      escrowStatus: order?.escrowStatus ?? null,
      buyerWallet: order?.buyerWallet ?? null,
    };
  });

  return NextResponse.json({ listings });
}
