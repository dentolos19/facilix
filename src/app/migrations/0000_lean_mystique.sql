CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`variant` text NOT NULL,
	`role` text DEFAULT 'supporting' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `facility_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_attachments_event_id_idx` ON `event_attachments` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_attachments_asset_id_idx` ON `event_attachments` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_attachments_event_asset_variant_idx` ON `event_attachments` (`event_id`,`asset_id`,`variant`);--> statement-breakpoint
CREATE TABLE `facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facility_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`zone_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `facility_zones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `facility_events` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text,
	`severity` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `facility_members` (
	`facility_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facility_members_facility_user_idx` ON `facility_members` (`facility_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `facility_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `video_frames` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`segment_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`output_name` text NOT NULL,
	`frame_index` integer NOT NULL,
	`at_sec` real NOT NULL,
	`detections` text NOT NULL,
	`image` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `video_segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `video_frames_segment_id_idx` ON `video_frames` (`segment_id`);--> statement-breakpoint
CREATE INDEX `video_frames_facility_id_idx` ON `video_frames` (`facility_id`);--> statement-breakpoint
CREATE INDEX `video_frames_device_id_idx` ON `video_frames` (`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `video_frames_idempotency_idx` ON `video_frames` (`segment_id`,`plugin_id`,`workflow_id`,`output_name`,`frame_index`);--> statement-breakpoint
CREATE TABLE `video_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`duration_sec` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
