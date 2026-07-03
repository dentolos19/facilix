CREATE TABLE `event_media` (
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
);--> statement-breakpoint

CREATE INDEX `event_media_event_id_idx` ON `event_media` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_media_asset_id_idx` ON `event_media` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_event_asset_variant_idx`
  ON `event_media` (`event_id`, `asset_id`, `variant`);--> statement-breakpoint

-- Existing intelligence alerts already carry their source segment asset ID in
-- facility_events.data. Backfill that video as source evidence when the asset
-- still exists.
INSERT OR IGNORE INTO `event_media` (
  `id`,
  `event_id`,
  `asset_id`,
  `kind`,
  `variant`,
  `role`,
  `sort_order`,
  `metadata`,
  `created_at`
)
SELECT
  lower(hex(randomblob(16))),
  event.id,
  json_extract(event.data, '$.assetId'),
  'video',
  'source-segment',
  'primary',
  0,
  json_object(
    'backfilled', true,
    'segmentId', json_extract(event.data, '$.segmentId'),
    'pluginId', json_extract(event.data, '$.pluginId')
  ),
  event.created_at
FROM `facility_events` AS event
INNER JOIN `assets` AS asset
  ON asset.id = json_extract(event.data, '$.assetId')
WHERE event.type = 'cctv:detection:alert'
  AND json_type(event.data, '$.assetId') = 'text';
