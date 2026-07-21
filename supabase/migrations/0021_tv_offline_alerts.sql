-- S0.2 fleet offline/stale alerts. Idempotent per offline episode:
-- one open row per device until recovered. Service-role only.

create table if not exists tv_offline_alerts (
  id uuid primary key default gen_random_uuid(),
  tv_device_id uuid not null references tv_devices (id) on delete cascade,
  property_id uuid references properties (id) on delete set null,
  -- sent | skipped:no-provider | error:<reason> | recovered
  status text not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  recovered_at timestamptz
);

-- At most one open (not-yet-recovered) incident per TV.
create unique index if not exists tv_offline_alerts_open_one
  on tv_offline_alerts (tv_device_id)
  where recovered_at is null;

create index if not exists tv_offline_alerts_device_idx
  on tv_offline_alerts (tv_device_id, created_at desc);

alter table tv_offline_alerts enable row level security;
