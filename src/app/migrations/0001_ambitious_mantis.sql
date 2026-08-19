CREATE TABLE `facility_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`device_id` text NOT NULL,
	`segment_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`step` text,
	`attempt` integer,
	`error` text,
	`output` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `video_segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `facility_processes_facility_created_idx` ON `facility_processes` (`facility_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `facility_processes_facility_status_idx` ON `facility_processes` (`facility_id`,`status`);--> statement-breakpoint
CREATE INDEX `facility_processes_device_id_idx` ON `facility_processes` (`device_id`);--> statement-breakpoint
CREATE INDEX `facility_processes_segment_id_idx` ON `facility_processes` (`segment_id`);--> statement-breakpoint
