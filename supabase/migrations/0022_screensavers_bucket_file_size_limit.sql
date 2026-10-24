-- TV-safe cap on direct Supabase Storage uploads (F-991). 150 MiB.
UPDATE storage.buckets
SET file_size_limit = 157286400
WHERE id = 'screensavers';
