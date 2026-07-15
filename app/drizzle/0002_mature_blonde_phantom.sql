CREATE TABLE `sponsored_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_hash` text NOT NULL,
	`fee_payer` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsored_transactions_message_hash_idx` ON `sponsored_transactions` (`message_hash`);