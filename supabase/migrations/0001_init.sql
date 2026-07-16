-- Phase 0 schema. RLS is default-deny on every table: no policies exist for
-- anon/authenticated roles, so only the service-role key (server code) can
-- read or write. Guest access is mediated entirely by guest_tokens lookups
-- in server code — guests never hold a database session.

create table properties (
  id uuid primary key default gen_random_uuid(),
  guesty_id text unique,
  name text not null,
  hero_image_url text,
  wifi_ssid text,
  wifi_password text,
  house_rules text,
  local_guide text,
  emergency_info text,
  created_at timestamptz not null default now()
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  guesty_id text unique,
  property_id uuid not null references properties (id) on delete cascade,
  guest_first_name text,
  check_in timestamptz not null,
  check_out timestamptz not null,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Opaque short tokens for QR deep links. The QR never encodes a Guesty
-- reservation ID — anyone photographing the code could enumerate those.
create table guest_tokens (
  token text primary key,
  reservation_id uuid not null references reservations (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index guest_tokens_reservation_idx on guest_tokens (reservation_id);
create index reservations_property_idx on reservations (property_id);

alter table properties enable row level security;
alter table reservations enable row level security;
alter table guest_tokens enable row level security;
