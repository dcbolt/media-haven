-- Path C: portal "Open on TV" → poll → native app intent (STREAMING-SEAMLESS).
-- Poll-only delivery; at-most-once claim; short TTL. Service-role RLS only.
-- Depends on 0019 (orgs). Claude ACK 2026-07-20: error column (not payload).

create table if not exists tv_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  property_id uuid not null references properties (id) on delete cascade,
  -- null = any TV on property; set = target one device (multi-room picker)
  tv_device_id uuid references tv_devices (id) on delete cascade,
  action text not null check (action in ('launch_app')),
  payload jsonb not null default '{}'::jsonb,
  -- payload: { "slug": "netflix", "androidPackage": "com.netflix.ninja" }
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'expired', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_device_id uuid references tv_devices (id),
  completed_at timestamptz
);

create index if not exists tv_commands_poll_idx
  on tv_commands (property_id, status, expires_at)
  where status = 'pending';

create index if not exists tv_commands_rate_idx
  on tv_commands (property_id, created_at desc);

alter table tv_commands enable row level security;
