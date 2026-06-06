CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- Composite index for querying video recordings by facility + device + time
CREATE INDEX IF NOT EXISTS `idx_video_recordings_facility_device_started`
	ON `video_recordings` (`facility_id`, `device_id`, `started_at` DESC);
--> statement-breakpoint
-- Index for querying device logs by device + time
CREATE INDEX IF NOT EXISTS `idx_device_logs_device_created`
	ON `device_logs` (`device_id`, `created_at` DESC);
--> statement-breakpoint
-- Index for TTL purge of device logs by creation time
CREATE INDEX IF NOT EXISTS `idx_device_logs_created`
	ON `device_logs` (`created_at`);
--> statement-breakpoint
-- Index for TTL purge of sensor readings by timestamp
CREATE INDEX IF NOT EXISTS `idx_sensor_readings_timestamp`
	ON `sensor_readings` (`timestamp`);
