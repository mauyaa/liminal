import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, merchants, phantomSessions } from "@/lib/db/schema";
import { generateDappKeyPair, encodeKey, buildConnectUrl } from "@/lib/solana/phantom-deeplink";

/**
 * Entry point for checkout inside a context with no browser-extension
 * wallet - a Telegram in-app browser, or any native mobile context. Starts
 * Phantom's real encrypted deeplink handshake (see phantom-deeplink.ts for
 * why this can't be a bare URL) rather than the wallet-adapter flow
 * `/buy/[sku]` uses.
 */
export async function GET(request: NextRequest) {
  const sku = request.nextUrl.searchParams.get("sku");
  if (!sku) {
    return NextResponse.json({ message: "sku query param is required" }, { status: 400 });
  }

  const listing = await db
    .select({ sku: products.sku, title: products.title })
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(products.sku, sku))
    .then((rows) => rows[0]);
  if (!listing) {
    return NextResponse.json({ message: `no listing found for sku "${sku}"` }, { status: 404 });
  }

  const dapp = generateDappKeyPair();
  const token = randomBytes(24).toString("hex");

  await db.insert(phantomSessions).values({
    token,
    dappSecretKey: encodeKey(dapp.secretKey),
    dappPublicKey: encodeKey(dapp.publicKey),
    intent: JSON.stringify({ type: "buy", sku }),
  });

  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const connectUrl = buildConnectUrl({
    dappEncryptionPublicKey: encodeKey(dapp.publicKey),
    appUrl: baseUrl,
    redirectLink: `${baseUrl}/api/mobile/connect-callback?token=${token}`,
    cluster: "devnet",
  });

  return NextResponse.redirect(connectUrl);
}
