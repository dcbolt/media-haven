-- Rollback for 0027_tv_state_secret.sql (docs only — do not run without Devin GO).

alter table tv_devices
  drop column if exists last_unauthorized_at,
  drop column if exists last_legacy_auth_at,
  drop column if exists state_secret_pickup_expires_at,
  drop column if exists state_secret_pickup_hash,
  drop column if exists state_secret_required_at,
  drop column if exists state_secret_pending_hash,
  drop column if exists state_secret_hash;