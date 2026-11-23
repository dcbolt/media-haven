-- Rollback for 0027_tv_state_secret.sql (docs only — do not run without Devin GO).
-- Reverses only MH185-1 / MH186 columns on tv_devices.

alter table tv_devices
  drop column if exists last_legacy_auth_at,
  drop column if exists state_secret_pickup_expires_at,
  drop column if exists state_secret_pickup_hash,
  drop column if exists state_secret_hash;