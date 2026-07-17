-- Phase 1.8: outbound launch-alert log. One row per
-- (subscriber, launch, kind, channel) attempt — the idempotency guard that
-- makes the alert cron safe to re-run every few minutes. Also adds the
-- unsubscribe timestamp the send pipeline honors.

create table launch_alerts (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references guest_subscribers (id) on delete cascade,
  launch_key text not null,          -- slug of the mission name
  kind text not null,                -- t24 | t1 | delay | scrub
  channel text not null,             -- email | sms
  status text not null,              -- sent | skipped:<reason> | error:<reason>
  net text,                          -- launch NET at send time (slip detection)
  created_at timestamptz not null default now()
);

create unique index launch_alerts_once
  on launch_alerts (subscriber_id, launch_key, kind, channel);

alter table launch_alerts enable row level security;

alter table guest_subscribers
  add column unsubscribed_at timestamptz;
