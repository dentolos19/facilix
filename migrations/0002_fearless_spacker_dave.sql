PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_facilities`("id", "name", "data", "created_at", "updated_at") SELECT "id", "name", "data", "created_at", "updated_at" FROM `facilities`;--> statement-breakpoint
DROP TABLE `facilities`;--> statement-breakpoint
ALTER TABLE `__new_facilities` RENAME TO `facilities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_facility_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_facility_devices`("id", "facility_id", "name", "type", "status", "data", "notes", "created_at", "updated_at") SELECT "id", "facility_id", "name", "type", "status", "data", "notes", "created_at", "updated_at" FROM `facility_devices`;--> statement-breakpoint
DROP TABLE `facility_devices`;--> statement-breakpoint
ALTER TABLE `__new_facility_devices` RENAME TO `facility_devices`;--> statement-breakpoint
ALTER TABLE `device_logs` ADD `data` text NOT NULL;