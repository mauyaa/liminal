CREATE TABLE `disputes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_pda` text NOT NULL,
	`opened_at` integer NOT NULL,
	`resolved_seller_bps` integer,
	`verdict_reasoning` text,
	`verdict_hash` text,
	`resolved_tx_signature` text,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `disputes_order_pda_idx` ON `disputes` (`order_pda`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_pda` text NOT NULL,
	`submitted_by` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
