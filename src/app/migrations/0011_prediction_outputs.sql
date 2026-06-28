-- Create prediction_outputs table for Roboflow workflow frame outputs
CREATE TABLE `prediction_outputs` (
  `id` text PRIMARY KEY NOT NULL,
  `before_asset_id` text NOT NULL,
  `after_asset_id` text NOT NULL,
  `segment_id` text NOT NULL,
  `facility_id` text NOT NULL,
  `device_id` text NOT NULL,
  `plugin_id` text NOT NULL,
  `workflow_id` text NOT NULL,
  `output_name` text NOT NULL,
  `frame_index` integer NOT NULL,
  `at_sec` real NOT NULL,
  `predictions` text NOT NULL,
  `image` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`before_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`after_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`segment_id`) REFERENCES `video_segments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

-- Index for querying by segment
CREATE INDEX IF NOT EXISTS `prediction_outputs_segment_id_idx`
  ON `prediction_outputs` (`segment_id`);--> statement-breakpoint

-- Index for querying by facility
CREATE INDEX IF NOT EXISTS `prediction_outputs_facility_id_idx`
  ON `prediction_outputs` (`facility_id`);--> statement-breakpoint

-- Index for querying by device
CREATE INDEX IF NOT EXISTS `prediction_outputs_device_id_idx`
  ON `prediction_outputs` (`device_id`);--> statement-breakpoint

-- Unique index for idempotency (segment + plugin + workflow + output + frame)
CREATE UNIQUE INDEX IF NOT EXISTS `prediction_outputs_idempotency_idx`
  ON `prediction_outputs` (`segment_id`, `plugin_id`, `workflow_id`, `output_name`, `frame_index`);
