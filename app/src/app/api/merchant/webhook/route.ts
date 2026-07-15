import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchants } from "@/lib/db/schema";
import { generateWebhookSecret } from "@/lib/webhooks";

interface SetWebhookBody {
  merchantWallet: string;
  webhookUrl: string;
}

/**
 * Sets (or updates) a merchant's webhook URL. A signing secret is generated
 * the first time a merchant configures a webhook and kept stable across
 * updates to the URL, so existing signature-verification code on the
 * merchant's side doesn't break when they change the endpoint.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SetWebhookBody | null;
  if (!body?.merchantWallet || !body?.webhookUrl) {
    return NextResponse.json({ message: "merchantWallet and webhookUrl are required" }, { status: 400 });
  }

  try {
    new URL(body.webhookUrl);
  } catch {
    return NextResponse.json({ message: "webhookUrl must be a valid URL" }, { status: 400 });
  }

  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.wallet, body.merchantWallet),
  });
  if (!merchant) {
    return NextResponse.json({ message: `no merchant found for wallet "${body.merchantWallet}"` }, { status: 404 });
  }

  const webhookSecret = merchant.webhookSecret ?? generateWebhookSecret();
  await db
    .update(merchants)
    .set({ webhookUrl: body.webhookUrl, webhookSecret })
    .where(eq(merchants.id, merchant.id));

  return NextResponse.json({ webhookUrl: body.webhookUrl, webhookSecret });
}
