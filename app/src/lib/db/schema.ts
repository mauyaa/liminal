import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/** Mirrors the on-chain `EscrowStatus` enum in programs/liminal/src/state.rs. */
export const ESCROW_STATUSES = ["INITIALIZED", "FUNDED", "SETTLED", "REFUNDED"] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export const merchants = sqliteTable(
  "merchants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wallet: text("wallet").notNull(),
    storeName: text("store_name").notNull(),
    // Both optional - a merchant that hasn't configured webhooks just
    // doesn't get any. webhookSecret is generated when webhookUrl is first
    // set, used to HMAC-sign delivered payloads.
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("merchants_wallet_idx").on(table.wallet)]
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchants.id),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    priceUsdc: integer("price_usdc").notNull(), // smallest unit (6 decimals)
    mint: text("mint").notNull(),
    // u64 on-chain; stored as a decimal string to avoid JS number precision
    // loss. Parse with BigInt(product.marketItemId) when using it.
    marketItemId: text("market_item_id").notNull(),
    deliveryWindowSeconds: integer("delivery_window_seconds").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("products_sku_idx").on(table.sku)]
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderPda: text("order_pda").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    buyerWallet: text("buyer_wallet"),
    escrowStatus: text("escrow_status", { enum: ESCROW_STATUSES })
      .notNull()
      .default("INITIALIZED"),
    fundTxSignature: text("fund_tx_signature"),
    resolutionTxSignature: text("resolution_tx_signature"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("orders_order_pda_idx").on(table.orderPda)]
);

export const subscriptionPlans = sqliteTable(
  "subscription_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchants.id),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    // smallest unit (e.g. 6 decimals for USDC), charged once per period
    amountBaseUnits: integer("amount_base_units").notNull(),
    periodHours: integer("period_hours").notNull(),
    mint: text("mint").notNull(),
    // u64 on-chain; stored as a decimal string to avoid JS number precision
    // loss, same convention as products.marketItemId. Parse with BigInt(...).
    planId: text("plan_id").notNull(),
    planPda: text("plan_pda").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("subscription_plans_plan_pda_idx").on(table.planPda)]
);

export const sponsoredTransactions = sqliteTable(
  "sponsored_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // sha256 of the unsigned transaction's compiled message - identifies
    // exactly which transaction the relayer pre-approved to fee-sponsor,
    // since a wallet's signing step doesn't change the message bytes.
    messageHash: text("message_hash").notNull(),
    feePayer: text("fee_payer").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("sponsored_transactions_message_hash_idx").on(table.messageHash)]
);

export const merchantsRelations = relations(merchants, ({ many }) => ({
  products: many(products),
  subscriptionPlans: many(subscriptionPlans),
}));

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ one }) => ({
  merchant: one(merchants, { fields: [subscriptionPlans.merchantId], references: [merchants.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  merchant: one(merchants, { fields: [products.merchantId], references: [merchants.id] }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  product: one(products, { fields: [orders.productId], references: [products.id] }),
}));
