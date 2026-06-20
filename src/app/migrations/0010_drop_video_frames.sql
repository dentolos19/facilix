-- Drop video_frames table and associated indexes.
-- Frame capture has been removed; only video segments are now captured.
DROP INDEX IF EXISTS "idx_video_frames_facility_device_captured";
DROP INDEX IF EXISTS "idx_video_frames_segment";
DROP TABLE IF EXISTS "video_frames";
