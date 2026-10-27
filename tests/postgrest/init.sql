-- Minimal orgs table + PostgREST roles (official quick-start pattern).
create role anon nologin;
create role authenticator noinherit login password 'pass';
grant anon to authenticator;

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
on conflict (id) do update set
  settings = excluded.settings;
