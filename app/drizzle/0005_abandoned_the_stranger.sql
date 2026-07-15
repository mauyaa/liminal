CREATE TABLE `phantom_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`dapp_secret_key` text NOT NULL,
	`dapp_public_key` text NOT NULL,
	`phantom_encryption_public_key` text,
	`phantom_session` text,
	`user_public_key` text,
	`intent` text NOT NULL,
	`status` text DEFAULT 'pending_connect' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phantom_sessions_token_idx` ON `phantom_sessions` (`token`);