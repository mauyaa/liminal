CREATE TABLE `merchants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet` text NOT NULL,
	`store_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_wallet_idx` ON `merchants` (`wallet`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_pda` text NOT NULL,
	`product_id` integer NOT NULL,
	`buyer_wallet` text,
	`escrow_status` text DEFAULT 'INITIALIZED' NOT NULL,
	`fund_tx_signature` text,
	`resolution_tx_signature` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_pda_idx` ON `orders` (`order_pda`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_id` integer NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`image_url` text NOT NULL,
	`price_usdc` integer NOT NULL,
	`mint` text NOT NULL,
	`market_item_id` text NOT NULL,
	`delivery_window_seconds` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_idx` ON `products` (`sku`);