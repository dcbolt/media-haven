-- Per-property CMS settings (host dashboard property editor): jsonb so new
-- knobs (feed toggles, future flags) need no schema change.
-- settings.feeds.{weather,tides,launches}: false disables that TV feed/slide.

alter table properties
  add column if not exists settings jsonb not null default '{}'::jsonb;
