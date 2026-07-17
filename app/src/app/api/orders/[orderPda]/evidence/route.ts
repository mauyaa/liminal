import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { db } from "@/lib/db/client";
import { orders, products, merchants, evidence } from "@/lib/db/schema";

export const runtime = "nodejs";

interface EvidenceBody {
  wallet: string;
  content: string;
  signature: string; // base58, over `submit-evidence:${orderPda}`
}

/**
 * Either party on a disputed order attaches a statement (text or a link) -
 * verified as actually coming from that wallet via a free off-chain signed
 * message, the same `signMessage` pattern `signal-delivery` uses, rather
 * than a new auth system. No file storage - consistent with `deliveryNote`.
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

  const body = (await request.json().catch(() => null)) as EvidenceBody | null;
  if (!body?.wallet || !body?.content || !body?.signature) {
    return NextResponse.json({ message: "wallet, content, and signature are required" }, { status: 400 });
  }
  if (body.content.length > 4000) {
    return NextResponse.json({ message: "content must be 4000 characters or fewer" }, { status: 400 });
  }

  const row = await db
    .select({ buyerWallet: orders.buyerWallet, merchantWallet: merchants.wallet, escrowStatus: orders.escrowStatus })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(orders.orderPda, orderPda.toBase58()))
    .then((rows) => rows[0]);

  if (!row) {
    return NextResponse.json({ message: `no order found for "${orderPdaParam}"` }, { status: 404 });
  }

  let submittedBy: "buyer" | "seller";
  if (body.wallet === row.buyerWallet) submittedBy = "buyer";
  else if (body.wallet === row.merchantWallet) submittedBy = "seller";
  else {
    return NextResponse.json({ message: "wallet is neither the buyer nor the seller for this order" }, { status: 403 });
  }

  let walletPubkey: PublicKey;
  let signatureBytes: Uint8Array;
  try {
    walletPubkey = new PublicKey(body.wallet);
    signatureBytes = bs58.decode(body.signature);
  } catch {
    return NextResponse.json({ message: "wallet or signature is malformed" }, { status: 400 });
  }

  const expectedMessage = new TextEncoder().encode(`submit-evidence:${orderPda.toBase58()}`);
  const verified = nacl.sign.detached.verify(expectedMessage, signatureBytes, walletPubkey.toBytes());
  if (!verified) {
    return NextResponse.json({ message: "signature does not match wallet for this order" }, { status: 403 });
  }

  await db.insert(evidence).values({ orderPda: orderPda.toBase58(), submittedBy, content: body.content });

  return NextResponse.json({ orderPda: orderPda.toBase58(), submittedBy });
}

/** Lists evidence for an order - used by both the buyer/seller timeline view and the admin dispute page. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderPda: string }> }
) {
  const { orderPda } = await params;
  const rows = await db
    .select({ id: evidence.id, submittedBy: evidence.submittedBy, content: evidence.content, createdAt: evidence.createdAt })
    .from(evidence)
    .where(eq(evidence.orderPda, orderPda))
    .orderBy(evidence.createdAt);

  return NextResponse.json({ evidence: rows });
}
