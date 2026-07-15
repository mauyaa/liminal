import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, merchants, subscriptionPlans } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Machine-readable commerce discovery manifest: a live catalog of every
 * active listing and subscription plan across all merchants, with the
 * Solana Actions endpoint that actually executes each one. Not a
 * speculative "future work" stub - this reads the same DB the checkout
 * flow does, so an automated client (an AI purchasing agent, a price
 * comparison bot, or just a script) can discover and act on real, current
 * inventory without out-of-band knowledge of specific SKUs or plan ids.
 *
 * Deliberately just a catalog index, not a new transaction protocol: the
 * actual checkout mechanics are exactly `actions.json` + the Solana
 * Actions spec already documented in this repo - an agent capable of
 * building/signing a Solana transaction from an Actions POST response
 * needs nothing else.
 */
export async function GET(request: NextRequest) {
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const productRows = await db
    .select({
      sku: products.sku,
      title: products.title,
      description: products.description,
      priceUsdc: products.priceUsdc,
      mint: products.mint,
      merchantWallet: merchants.wallet,
      storeName: merchants.storeName,
    })
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id));

  const planRows = await db
    .select({
      planId: subscriptionPlans.planId,
      title: subscriptionPlans.title,
      description: subscriptionPlans.description,
      amountBaseUnits: subscriptionPlans.amountBaseUnits,
      periodHours: subscriptionPlans.periodHours,
      mint: subscriptionPlans.mint,
      merchantWallet: merchants.wallet,
      storeName: merchants.storeName,
    })
    .from(subscriptionPlans)
    .innerJoin(merchants, eq(subscriptionPlans.merchantId, merchants.id));

  return NextResponse.json({
    protocol: "solana-actions",
    network: "devnet",
    actionsManifest: `${baseUrl}/actions.json`,
    escrowProgram: "AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD",
    catalog: {
      products: productRows.map((p) => ({
        sku: p.sku,
        title: p.title,
        description: p.description,
        priceUsdc: p.priceUsdc / 1_000_000,
        mint: p.mint,
        merchant: { wallet: p.merchantWallet, storeName: p.storeName },
        checkout: `${baseUrl}/api/actions/buy/${p.sku}`,
        checkoutGasless: `${baseUrl}/api/actions/buy/${p.sku}?sponsored=true`,
      })),
      subscriptionPlans: planRows.map((plan) => ({
        planId: plan.planId,
        title: plan.title,
        description: plan.description,
        priceUsdc: plan.amountBaseUnits / 1_000_000,
        periodHours: plan.periodHours,
        mint: plan.mint,
        merchant: { wallet: plan.merchantWallet, storeName: plan.storeName },
        subscribe: `${baseUrl}/api/actions/subscribe/${plan.planId}`,
      })),
    },
  });
}
