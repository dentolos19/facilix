ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint

CREATE TABLE `facility_members` (
	`facility_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE UNIQUE INDEX `facility_members_facility_user_idx` ON `facility_members` (`facility_id`,`user_id`);--> statement-breakpoint

INSERT INTO `facility_members` (`facility_id`, `user_id`, `created_at`)
SELECT DISTINCT f.id, u.id, strftime('%s', 'now') * 1000
FROM `facilities` f
CROSS JOIN `users` u;
