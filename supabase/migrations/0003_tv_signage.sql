-- TV signage devices. A TV opens /tv, generates a device id, and shows a
-- pairing code; the host claims it to a property from the dashboard. Same
-- default-deny RLS posture: only server code (service role) touches this.

create table tv_devices (
  id uuid primary key,
  pair_code text unique not null,
  property_id uuid references properties (id) on delete set null,
  claimed_at timestamptz,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table tv_devices enable row level security;

-- For the weather panel on the signage screen (Open-Meteo lookup).
alter table properties
  add column latitude double precision,
  add column longitude double precision;
