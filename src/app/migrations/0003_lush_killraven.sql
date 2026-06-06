CREATE TABLE `sensor_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`sensor_type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`secondary_value` real,
	`secondary_unit` text,
	`battery_pct` real,
	`signal_rssi_dbm` integer,
	`source` text DEFAULT 'simulation' NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sensor_readings_device_timestamp` ON `sensor_readings` (`device_id`, `timestamp` DESC);--> statement-breakpoint
CREATE INDEX `idx_sensor_readings_facility_timestamp` ON `sensor_readings` (`facility_id`, `timestamp` DESC);
