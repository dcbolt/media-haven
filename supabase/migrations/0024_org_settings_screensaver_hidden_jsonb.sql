-- Optional: atomic merge of one key in orgs.settings (F-2539).
-- NOT applied in this PR — app uses optimistic read/compare/write on settings jsonb.
-- Apply manually if optimistic updates conflict under heavy concurrent host edits.

create or replace function public.merge_org_settings_text_array(
  p_org_id uuid,
  p_key text,
  p_value jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update orgs
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), array[p_key], p_value, true)
  where id = p_org_id;
end;
$$;
