-- Phase A tenant plumbing (SAAS-ARCHITECTURE). Additive only.
-- Florida Havens = Tenant Zero. RLS remains default-deny (service-role only).
-- New tables/FKs are org-scoped so multi-tenant SaaS can land without a fork.

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table orgs enable row level security;

-- Stable id so lib/org.ts can hard-reference Tenant Zero without a lookup race.
insert into orgs (id, name, slug, settings)
values (
  '11111111-1111-4111-8111-111111111111',
  'Florida Havens',
  'florida-havens',
  '{"bookBaseUrl":"https://www.thefloridahavens.com","brand":"florida-havens"}'::jsonb
)
on conflict (slug) do nothing;

alter table properties
  add column if not exists org_id uuid references orgs (id);

-- Backfill every existing property onto Tenant Zero.
update properties
set org_id = '11111111-1111-4111-8111-111111111111'
where org_id is null;

-- After backfill, require org on every property.
alter table properties
  alter column org_id set not null;

create index if not exists properties_org_idx on properties (org_id);

-- Integration redline (Claude): every existing writer (Guesty sync upserts
-- new listings without org_id) must survive the NOT NULL — Tenant-Zero
-- default until multi-tenant hosts pass real org ids explicitly.
alter table properties
  alter column org_id set default '11111111-1111-4111-8111-111111111111';
