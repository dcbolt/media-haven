-- Throwaway stack for signage persistence e2e (localhost only).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password 'pass';
grant anon to authenticator;
grant authenticated to authenticator;
grant service_role to authenticator;

create table if not exists orgs (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id uuid primary key,
  name text not null,
  guesty_id text,
  org_id uuid not null references orgs (id)
);

insert into orgs (id, name, slug, settings)
values (
  '11111111-1111-4111-8111-111111111111',
  'Florida Havens',
  'florida-havens',
  '{"bookBaseUrl":"https://www.thefloridahavens.com","brand":"florida-havens"}'::jsonb
)
on conflict (id) do update set settings = excluded.settings;

insert into properties (id, name, guesty_id, org_id)
values (
  '33333333-3333-4333-8333-333333333333',
  'Turtle Haven',
  null,
  '11111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

create table if not exists tv_devices (
  id uuid primary key,
  pair_code text unique not null,
  property_id uuid references properties (id) on delete set null,
  claimed_at timestamptz,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

\i /docker-entrypoint-initdb.d/migrations/0026_tv_attribution_tag.sql
\i /docker-entrypoint-initdb.d/migrations/0025_qr_scan_events.sql

insert into tv_devices (
  id,
  pair_code,
  property_id,
  claimed_at,
  attribution_tag
)
values (
  '22222222-2222-4222-8222-222222222222',
  'E2ETV01',
  '33333333-3333-4333-8333-333333333333',
  now(),
  'e2etvtag0001'
)
on conflict (id) do update set
  property_id = excluded.property_id,
  attribution_tag = excluded.attribution_tag;

-- Mirror hosted Supabase default grants; 0025 REVOKE on analytics tables still denies.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;