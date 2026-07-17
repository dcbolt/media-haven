-- Guidebook section categories for the TV menu: 'dining' and 'nearby'
-- sections surface in their own remote-navigable categories; null = general
-- guidebook only. Set from the host CMS property editor.

alter table property_sections
  add column if not exists category text;
