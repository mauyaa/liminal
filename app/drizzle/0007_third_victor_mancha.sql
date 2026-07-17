CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_pda` text NOT NULL,
	`channel` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `challenge_deadline` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_note` text;