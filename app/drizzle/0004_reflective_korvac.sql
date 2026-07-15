CREATE TABLE `subscription_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`subscriber_wallet` text NOT NULL,
	`subscription_pda` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_subscribers_pda_idx` ON `subscription_subscribers` (`subscription_pda`);