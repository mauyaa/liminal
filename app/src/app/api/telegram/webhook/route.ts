import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, merchants } from "@/lib/db/schema";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

async function sendMessage(chatId: number, text: string, url?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(url
        ? { reply_markup: { inline_keyboard: [[{ text: "Confirm purchase", url }]] } }
        : {}),
    }),
  });
}

/**
 * Telegram bot webhook: a chat command like `/buy liminal-demo-1` gets a
 * reply with an inline button whose URL is the mobile checkout entrypoint
 * (/api/mobile/checkout), which runs the full Phantom deeplink handshake -
 * see phantom-deeplink.ts. Tapping the button inside Telegram's in-app
 * browser opens Phantom directly, no browser-extension wallet needed.
 *
 * Ready to use as soon as TELEGRAM_BOT_TOKEN is set - creating the actual
 * bot (via @BotFather) is an external account creation this code can't do
 * on its own; once you have a token, register this URL with
 * `https://api.telegram.org/bot<token>/setWebhook?url=<this route's URL>`.
 */
export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ message: "Telegram bot is not configured on this server" }, { status: 404 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const match = message.text.trim().match(/^\/buy(?:@\w+)?\s+(\S+)$/);
  if (!match) {
    await sendMessage(message.chat.id, "Send /buy <sku> to check out a listing here in chat.");
    return NextResponse.json({ ok: true });
  }

  const sku = match[1];
  const listing = await db
    .select({ title: products.title, priceUsdc: products.priceUsdc })
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(eq(products.sku, sku))
    .then((rows) => rows[0]);

  if (!listing) {
    await sendMessage(message.chat.id, `No listing found for "${sku}".`);
    return NextResponse.json({ ok: true });
  }

  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const priceLabel = (listing.priceUsdc / 1_000_000).toFixed(2);
  await sendMessage(
    message.chat.id,
    `${listing.title} - $${priceLabel}. Tap below to pay with Phantom.`,
    `${baseUrl}/api/mobile/checkout?sku=${encodeURIComponent(sku)}`
  );

  return NextResponse.json({ ok: true });
}
