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
  storeName: string;
  sku: string;
  title: string;
  description?: string;
  imageUrl: string;
  priceUsdc: number;
  mint: string;
  deliveryWindowSeconds: number;
}

/**
 * Creates (or reuses) a merchant + product row, then returns an unsigned
 * `initialize_listing` transaction for the merchant's wallet to sign. The
 * on-chain `market_item_id` seed is the product's own row id, which is
 * globally unique and therefore also unique per-seller.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreateListingBody | null;
  if (
    !body?.merchantWallet ||
    !body?.storeName ||
    !body?.sku ||
    !body?.title ||
    !body?.imageUrl ||
    !body?.priceUsdc ||
    !body?.mint ||
    !body?.deliveryWindowSeconds
  ) {
    return NextResponse.json({ message: "missing required fields" }, { status: 400 });
  }

  let seller: PublicKey;
  let mint: PublicKey;
  try {
    seller = new PublicKey(body.merchantWallet);
    mint = new PublicKey(body.mint);
  } catch {
    return NextResponse.json({ message: "merchantWallet and mint must be base58 pubkeys" }, { status: 400 });
  }

  if (body.priceUsdc <= 0 || body.deliveryWindowSeconds <= 0) {
    return NextResponse.json(
      { message: "priceUsdc and deliveryWindowSeconds must be greater than zero" },
      { status: 400 }
    );
  }

  const existing = await db.query.products.findFirst({ where: eq(products.sku, body.sku) });
  if (existing) {
    return NextResponse.json({ message: `sku "${body.sku}" already exists` }, { status: 409 });
  }

  let merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, body.merchantWallet),
  });
  if (!merchant) {
    const inserted = await db
      .insert(merchants)
      .values({ wallet: body.merchantWallet, storeName: body.storeName })
      .returning();
    merchant = inserted[0];
  }

  const [product] = await db
    .insert(products)
    .values({
      merchantId: merchant.id,
      sku: body.sku,
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl,
      priceUsdc: body.priceUsdc,
      mint: body.mint,
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
    sku: body.sku,
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
