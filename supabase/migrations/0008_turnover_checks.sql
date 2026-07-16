-- Turnover media-wipe checklist records (DECISIONS: wipe = checklist, not
-- automation). One row per completed turnover, items stored as jsonb so the
-- checklist can evolve without migrations. Default-deny RLS as everywhere.

create table turnover_checks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  items jsonb not null,
  notes text,
  completed_at timestamptz not null default now()
);

create index turnover_checks_property_idx
  on turnover_checks (property_id, completed_at desc);

alter table turnover_checks enable row level security;
