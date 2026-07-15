CREATE TABLE `subscription_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`image_url` text NOT NULL,
	`amount_base_units` integer NOT NULL,
	`period_hours` integer NOT NULL,
	`mint` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_pda` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plans_plan_pda_idx` ON `subscription_plans` (`plan_pda`);