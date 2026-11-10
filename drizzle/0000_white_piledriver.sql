CREATE TABLE `lead_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`ip_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_fingerprint_unique` ON `lead_delivery` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `delivery_ip_created` ON `lead_delivery` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `delivery_expiry` ON `lead_delivery` (`expires_at`);