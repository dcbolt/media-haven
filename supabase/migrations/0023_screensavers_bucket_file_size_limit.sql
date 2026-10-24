-- Optional belt-and-suspenders bucket cap (F-991). App enforces without this migration.
UPDATE storage.buckets
SET file_size_limit = 157286400
WHERE id = 'screensavers';
