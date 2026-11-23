-- MH185-1: per-device shared secret for GET /api/tv/state (hash only server-side).
-- Default-deny: service role only; explicit revoke for Supabase API roles.

alter table tv_devices
  add column if not exists state_secret_hash text,
  add column if not exists state_secret_deliver boolean not null default false;

comment on column tv_devices.state_secret_hash is
  'SHA-256 hex of tv state bearer secret; plaintext lives on TV localStorage only.';
comment on column tv_devices.state_secret_deliver is
  'When true, next authorized poll includes stateSecret once for TV to persist.';

revoke all on table tv_devices from anon, authenticated;
revoke all on table tv_devices from public;