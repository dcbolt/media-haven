-- Interactive board (host request 2026-07-17): blocked items carry up to 4
-- recommended options (buttons on /roadmap.html) and optional step-by-step
-- instructions; choosing an option re-queues the item with the host's
-- response attached.
alter table roadmap_items add column if not exists options jsonb;
alter table roadmap_items add column if not exists steps jsonb;
alter table roadmap_items add column if not exists response text;
