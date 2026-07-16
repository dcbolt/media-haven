-- Per-property brand mark (white-on-transparent PNG/SVG). Shown on the TV
-- welcome slide, portal hero, and print card. Populated manually per
-- property (Table Editor) from /host/media upload URLs.

alter table properties
  add column logo_url text;
