-- MH185-1: per-device shared secret for GET /api/tv/state (hash only server-side).
-- Pickup tokens are host-minted, short-lived, single-use — never auto-delivered on UUID poll.
-- Numbered 0027 so it can ship after 0026_tv_attribution_tag.sql (PR #185) or alone.
-- Touches only tv_devices secret/pickup columns (IF NOT EXISTS).
-- Default-deny: service role only; explicit revoke for Supabase API roles.

alter table tv_devices
  add column if not exists state_secret_hash text,
  add column if not exists state_secret_pending_hash text,
  add column if not exists state_secret_required_at timestamptz,
  add column if not exists state_secret_pickup_hash text,
  add column if not exists state_secret_pickup_expires_at timestamptz,
  add column if not exists last_legacy_auth_at timestamptz,
  add column if not exists last_unauthorized_at timestamptz;

comment on column tv_devices.state_secret_hash is
  'SHA-256 hex of tv state bearer secret; plaintext lives on TV localStorage only.';
comment on column tv_devices.state_secret_pending_hash is
  'SHA-256 of new secret after pickup redeem; promoted to state_secret_hash when TV presents bearer.';
comment on column tv_devices.state_secret_required_at is
  'Sticky ratchet: set on first successful pickup redeem; cleared only when device row is deleted.';
comment on column tv_devices.state_secret_pickup_hash is
  'SHA-256 hex of one-time host-minted pickup token for secret delivery to TV.';
comment on column tv_devices.state_secret_pickup_expires_at is
  'Pickup token expiry; cleared after single successful redemption.';
comment on column tv_devices.last_legacy_auth_at is
  'Last UUID-only (legacy) full-state poll before per-device enrollment.';
comment on column tv_devices.last_unauthorized_at is
  'Last 401/503 auth poll; does not advance last_seen (fleet lockout signal).';

revoke all on table tv_devices from anon, authenticated;
revoke all on table tv_devices from public;