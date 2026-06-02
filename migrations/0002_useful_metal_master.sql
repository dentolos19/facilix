ALTER TABLE `monitor_recordings` RENAME TO `video_recordings`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_video_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`duration_sec` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_video_recordings`("id", "asset_id", "facility_id", "device_id", "duration_sec", "started_at", "ended_at", "created_at") SELECT "id", "asset_id", "facility_id", "device_id", "duration_sec", "started_at", "ended_at", "created_at" FROM `video_recordings`;--> statement-breakpoint
DROP TABLE `video_recordings`;--> statement-breakpoint
ALTER TABLE `__new_video_recordings` RENAME TO `video_recordings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;