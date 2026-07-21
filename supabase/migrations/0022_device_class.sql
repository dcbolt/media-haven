-- S3.6 device class: streamer (Shield/GTV entertainment) vs signage
-- (Cast Pro / ambient Web Mode only). Default streamer so existing
-- living-room TVs keep intent launch + Entertainment slides.
-- HARDWARE-STANDARD: Cast Pro never replaces Netflix host SoC.

alter table tv_devices
  add column if not exists device_class text not null default 'streamer';

-- Relaxed check via constraint name so re-runs are safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tv_devices_device_class_check'
  ) then
    alter table tv_devices
      add constraint tv_devices_device_class_check
      check (device_class in ('streamer', 'signage'));
  end if;
end $$;

comment on column tv_devices.device_class is
  'streamer = entertainment SoC; signage = ambient Web Mode only (Cast Pro)';
