import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { phantomSessions } from "@/lib/db/schema";
import { decodeKey, decryptPayload } from "@/lib/solana/phantom-deeplink";

interface SignData {
  signature: string;
}

function htmlPage(body: string) {
  return new NextResponse(`<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;">${body}</body></html>`, {
    headers: { "Content-Type": "text/html" },
  });
}

/** Phantom redirects here after the user approves (or rejects) signing and sending the transaction. */
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
    const errorMessage = params.get("errorMessage") ?? "transaction rejected";
    await db.update(phantomSessions).set({ status: "failed", errorMessage }).where(eq(phantomSessions.id, session.id));
    return htmlPage(
      `<h2>Nothing was charged.</h2><p>You declined in Phantom — safe to close this page.</p><p style="color:#6b6b6b;font-size:13px;">${errorMessage}</p>`
    );
  }

  const nonce = params.get("nonce");
  const data = params.get("data");
  if (!nonce || !data || !session.phantomEncryptionPublicKey) {
    return NextResponse.json({ message: "missing nonce, data, or no connected session" }, { status: 400 });
  }

  const dappSecretKey = decodeKey(session.dappSecretKey);
  const { signature } = decryptPayload<SignData>(data, nonce, session.phantomEncryptionPublicKey, dappSecretKey);

  await db.update(phantomSessions).set({ status: "completed" }).where(eq(phantomSessions.id, session.id));

  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  return htmlPage(
    `<h2>Payment protected.</h2><p>Your order is in escrow — the seller pays out only on confirmed delivery.</p><p><a href="${explorerUrl}">View on Explorer</a></p>`
  );
}
