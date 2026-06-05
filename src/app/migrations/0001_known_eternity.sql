CREATE TABLE `monitor_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`duration_sec` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
