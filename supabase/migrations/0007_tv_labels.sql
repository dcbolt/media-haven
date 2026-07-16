-- Human-friendly TV names ("Living Room", "Master Bedroom") for the host
-- TV management dashboard.

alter table tv_devices
  add column label text;
