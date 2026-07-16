-- Value-first email capture from the guest portal ("rocket launch alerts
-- during your stay" opt-in). The owned guest list is the direct-booking
-- remarketing channel. Same default-deny RLS: writes go through server code.

create table guest_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text not null default 'portal',
  reservation_id uuid references reservations (id) on delete set null,
  consented_marketing boolean not null default true,
  created_at timestamptz not null default now()
);

alter table guest_subscribers enable row level security;
