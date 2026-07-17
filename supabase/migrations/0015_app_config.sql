-- Small key/value store for app-level settings the host should be able to
-- rotate without a deploy or Vercel env change. First use: the host access
-- code (lib/host-auth reads it with env fallback).
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
