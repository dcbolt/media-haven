-- Optional belt-and-suspenders bucket cap. App flags oversized objects without this.
-- 157286400 bytes must match lib/tv-video-byte-cap.ts MAX_TV_VIDEO_BYTES (150 MiB).
UPDATE storage.buckets
SET file_size_limit = 157286400
WHERE id = 'screensavers';
