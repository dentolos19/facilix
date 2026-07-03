ALTER TABLE `event_media` RENAME TO `event_attachments`;--> statement-breakpoint

DROP INDEX `event_media_event_id_idx`;--> statement-breakpoint
DROP INDEX `event_media_asset_id_idx`;--> statement-breakpoint
DROP INDEX `event_media_event_asset_variant_idx`;--> statement-breakpoint

CREATE INDEX `event_attachments_event_id_idx`
  ON `event_attachments` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_attachments_asset_id_idx`
  ON `event_attachments` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_attachments_event_asset_variant_idx`
  ON `event_attachments` (`event_id`, `asset_id`, `variant`);--> statement-breakpoint

-- Attach up to three persisted annotated prediction outputs to existing CCTV
-- alerts. Prefer frames with more detections so the primary attachment shows
-- the clearest available explanation of what triggered the event.
INSERT OR IGNORE INTO `event_attachments` (
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
  ranked.event_id,
  ranked.after_asset_id,
  'image',
  'annotated-frame',
  CASE WHEN ranked.attachment_rank = 1 THEN 'primary' ELSE 'supporting' END,
  ranked.attachment_rank - 1,
  json_object(
    'backfilled', true,
    'segmentId', ranked.segment_id,
    'pluginId', ranked.plugin_id,
    'frameIndex', ranked.frame_index,
    'atSec', ranked.at_sec,
    'predictions', json(ranked.predictions)
  ),
  ranked.created_at
FROM (
  SELECT
    event.id AS event_id,
    event.created_at,
    output.after_asset_id,
    output.segment_id,
    output.plugin_id,
    output.frame_index,
    output.at_sec,
    output.predictions,
    row_number() OVER (
      PARTITION BY event.id
      ORDER BY json_array_length(output.predictions) DESC, output.frame_index ASC
    ) AS attachment_rank
  FROM `facility_events` AS event
  INNER JOIN `prediction_outputs` AS output
    ON output.segment_id = json_extract(event.data, '$.segmentId')
    AND output.plugin_id = json_extract(event.data, '$.pluginId')
  INNER JOIN `assets` AS asset
    ON asset.id = output.after_asset_id
  WHERE event.type = 'cctv:detection:alert'
    AND json_array_length(output.predictions) > 0
) AS ranked
WHERE ranked.attachment_rank <= 3;--> statement-breakpoint

-- An annotated frame explains the trigger better than the source clip. Keep
-- the clip as supporting source evidence after a still has been attached.
UPDATE `event_attachments`
SET `role` = 'source', `sort_order` = 3
WHERE `variant` = 'source-segment'
  AND EXISTS (
    SELECT 1
    FROM `event_attachments` AS annotated
    WHERE annotated.event_id = event_attachments.event_id
      AND annotated.variant = 'annotated-frame'
  );
