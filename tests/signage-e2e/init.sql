-- Throwaway Tenant Zero + signage tables (0025) for local e2e only.
create role anon nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password 'pass';
grant anon to authenticator;
grant service_role to authenticator;

create table if not exists orgs (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon;
grant all on table orgs to anon;

insert into orgs (id, name, slug, settings)
values (
  '11111111-1111-4111-8111-111111111111',
  'Florida Havens',
  'florida-havens',
  '{"bookBaseUrl":"https://www.thefloridahavens.com","brand":"florida-havens"}'::jsonb
)
on conflict (id) do update set settings = excluded.settings;

create table if not exists qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  slug text not null,
  slide_id text,
  property_slug text not null default 'unknown',
  tv_device_id text,
  scanned_hour timestamptz not null,
  ua_class text not null default 'unknown',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tv_slide_impressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  slide_id text not null,
  property_slug text not null default 'unknown',
  tv_device_id text,
  shown_hour timestamptz not null,
  show_count integer not null default 1 check (show_count >= 0),
  seconds_on_screen integer not null default 0 check (seconds_on_screen >= 0),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tv_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  property_slug text not null default 'unknown',
  tv_device_id text,
  slide_id text,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  submitted_hour timestamptz not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

grant all on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

alter table qr_scan_events disable row level security;
alter table tv_slide_impressions disable row level security;
alter table tv_feedback_submissions disable row level security;