-- Living roadmap board (public/roadmap.html + /api/roadmap): every feature
-- request, bug, and question with reporter and live status. Key-gated via
-- HOST_ACCESS_CODE; RLS default-deny (service role only, like every table).

create table if not exists roadmap_items (
  id uuid primary key default gen_random_uuid(),
  num serial,
  kind text not null default 'feature',     -- feature | bug | question
  title text not null,
  body text,
  reporter text,
  status text not null default 'submitted', -- submitted | planned | in_progress | shipped | blocked | wont_do
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shipped_at timestamptz
);

alter table roadmap_items enable row level security;
