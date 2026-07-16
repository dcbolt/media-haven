-- Guide book content as ordered sections per property, mirroring the
-- structure of thefloridahavens.com/dunes-guide-book (House Rules, When You
-- Arrive, The Beach, Sea Turtles, Rocket Launches, ...). Replaces the three
-- generic text columns on properties, which remain as a legacy fallback.

create table property_sections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  slug text not null,
  title text not null,
  body text not null,
  sort integer not null default 0,
  show_on_tv boolean not null default true,
  unique (property_id, slug)
);

create index property_sections_property_idx on property_sections (property_id, sort);

alter table property_sections enable row level security;
