-- Host-corrected signage name for a stay ("The Wambolts" spelled wrong in
-- Guesty, honeymooners who'd rather see first names, etc.). NULL = derive
-- from the Guesty guest data as usual; sync never touches this column.
alter table reservations add column if not exists guest_label_override text;
