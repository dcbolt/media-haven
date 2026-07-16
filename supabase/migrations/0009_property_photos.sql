-- Full listing photo sets from Guesty (media sweep): jsonb array of image
-- URLs per property. Used for TV ambient photo slides, standby slideshow,
-- and surface backgrounds. hero_image_url remains the primary shot.

alter table properties
  add column photos jsonb not null default '[]'::jsonb;
