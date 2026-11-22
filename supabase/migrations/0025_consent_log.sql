-- Consent audit log for guide signup + Wi-Fi captive portal (CAN-SPAM posture).
-- No IP, MAC, or user-agent — email hash preferred; plaintext email optional.
-- Default-deny RLS: server code only; no anon/authenticated read policies.

create table consent_log (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  email text,
  property text,
  source text not null,
  consented_marketing boolean not null default false,
  consent_text_version text not null,
  created_at timestamptz not null default now()
);

create index consent_log_email_hash_idx on consent_log (email_hash);
create index consent_log_source_created_idx on consent_log (source, created_at desc);

alter table consent_log enable row level security;