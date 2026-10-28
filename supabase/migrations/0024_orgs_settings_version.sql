-- Optimistic concurrency for orgs.settings without whole-jsonb URL filters.
-- version CAS: PATCH ?id=eq.&version=eq.N with settings in body only.
-- Additive only; RLS unchanged (default-deny on orgs).

alter table orgs
  add column if not exists version bigint not null default 0;

create or replace function orgs_bump_version_on_settings_change()
returns trigger
language plpgsql
as $$
begin
  if new.settings is distinct from old.settings then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists orgs_bump_version_on_settings_change on orgs;

create trigger orgs_bump_version_on_settings_change
  before update on orgs
  for each row
  execute function orgs_bump_version_on_settings_change();

-- Rollback (manual, not applied automatically):
-- drop trigger if exists orgs_bump_version_on_settings_change on orgs;
-- drop function if exists orgs_bump_version_on_settings_change();
-- alter table orgs drop column if exists version;
