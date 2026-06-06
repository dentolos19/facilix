ALTER TABLE `device_logs` RENAME TO `facility_events`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_facility_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text,
	`severity` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_facility_events`("id", "device_id", "severity", "type", "message", "data", "created_at", "updated_at") SELECT "id", "device_id", "severity", "type", "message", "data", "created_at", "updated_at" FROM `facility_events`;--> statement-breakpoint
DROP TABLE `facility_events`;--> statement-breakpoint
ALTER TABLE `__new_facility_events` RENAME TO `facility_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;