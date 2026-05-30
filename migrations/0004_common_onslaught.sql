PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`password` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at") SELECT "id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", CASE WHEN "access_token_expires_at" IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', "access_token_expires_at", 'unixepoch') END, CASE WHEN "refresh_token_expires_at" IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', "refresh_token_expires_at", 'unixepoch') END, "scope", "password", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_assets`("id", "name", "type", "size", "hash", "created_at", "updated_at") SELECT "id", "name", "type", "size", "hash", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
CREATE TABLE `__new_device_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`severity` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_device_logs`("id", "device_id", "severity", "type", "message", "data", "created_at", "updated_at") SELECT "id", "device_id", "severity", "type", "message", "data", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `device_logs`;--> statement-breakpoint
DROP TABLE `device_logs`;--> statement-breakpoint
ALTER TABLE `__new_device_logs` RENAME TO `device_logs`;--> statement-breakpoint
CREATE TABLE `__new_facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_facilities`("id", "name", "data", "created_at", "updated_at") SELECT "id", "name", "data", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `facilities`;--> statement-breakpoint
DROP TABLE `facilities`;--> statement-breakpoint
ALTER TABLE `__new_facilities` RENAME TO `facilities`;--> statement-breakpoint
CREATE TABLE `__new_facility_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`zone_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `facility_zones`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_facility_devices`("id", "facility_id", "zone_id", "name", "type", "status", "data", "notes", "created_at", "updated_at") SELECT "id", "facility_id", "zone_id", "name", "type", "status", "data", "notes", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `facility_devices`;--> statement-breakpoint
DROP TABLE `facility_devices`;--> statement-breakpoint
ALTER TABLE `__new_facility_devices` RENAME TO `facility_devices`;--> statement-breakpoint
CREATE TABLE `__new_facility_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_facility_zones`("id", "facility_id", "name", "data", "notes", "created_at", "updated_at") SELECT "id", "facility_id", "name", "data", "notes", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `facility_zones`;--> statement-breakpoint
DROP TABLE `facility_zones`;--> statement-breakpoint
ALTER TABLE `__new_facility_zones` RENAME TO `facility_zones`;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "expires_at", "token", "created_at", "updated_at", "ip_address", "user_agent", "userId") SELECT "id", strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at", 'unixepoch'), "token", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch'), "ip_address", "user_agent", "userId" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "email_verified", "image", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `__new_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text,
	`updated_at` text
);--> statement-breakpoint
INSERT INTO `__new_verifications`("id", "identifier", "value", "expires_at", "created_at", "updated_at") SELECT "id", "identifier", "value", strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at", 'unixepoch'), CASE WHEN "created_at" IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", 'unixepoch') END, CASE WHEN "updated_at" IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", 'unixepoch') END FROM `verifications`;--> statement-breakpoint
DROP TABLE `verifications`;--> statement-breakpoint
ALTER TABLE `__new_verifications` RENAME TO `verifications`;
