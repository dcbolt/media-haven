-- Formal signage lockup ("The Wambolts") needs the family name; Guesty has
-- carried it all along, we only stored the first name.
alter table reservations add column if not exists guest_last_name text;
