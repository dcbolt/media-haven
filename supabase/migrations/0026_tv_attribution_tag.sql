-- Public attribution tags for QR / feedback (never expose device UUIDs off-device).

alter table tv_devices
  add column if not exists attribution_tag text;

update tv_devices
set attribution_tag = lower(
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
)
where attribution_tag is null;

alter table tv_devices
  alter column attribution_tag set not null;

create unique index if not exists tv_devices_attribution_tag_uidx
  on tv_devices (attribution_tag);