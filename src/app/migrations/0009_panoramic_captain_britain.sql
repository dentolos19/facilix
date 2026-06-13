-- Rename video_recordings to video_segments
ALTER TABLE `video_recordings` RENAME TO `video_segments`;--> statement-breakpoint

-- Drop old index (name stays but now points at renamed table)
DROP INDEX IF EXISTS `idx_video_recordings_facility_device_started`;--> statement-breakpoint

-- Recreate index with new table context
CREATE INDEX IF NOT EXISTS `idx_video_segments_facility_device_started`
  ON `video_segments` (`facility_id`, `device_id`, `started_at` DESC);--> statement-breakpoint

-- New table: video_frames
CREATE TABLE `video_frames` (
  `id` text PRIMARY KEY NOT NULL,
  `asset_id` text NOT NULL,
  `segment_id` text,
  `facility_id` text NOT NULL,
  `device_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `captured_at` integer NOT NULL,
  `data` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`segment_id`) REFERENCES `video_segments`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`device_id`) REFERENCES `facility_devices`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

-- Index for querying frames by facility + device + capture time
CREATE INDEX IF NOT EXISTS `idx_video_frames_facility_device_captured`
  ON `video_frames` (`facility_id`, `device_id`, `captured_at` DESC);--> statement-breakpoint

-- Index for finding frames belonging to a segment
CREATE INDEX IF NOT EXISTS `idx_video_frames_segment`
  ON `video_frames` (`segment_id`);
